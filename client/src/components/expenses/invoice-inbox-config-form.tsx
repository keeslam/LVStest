import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Inbox, Loader2 } from "lucide-react";
import type { InboxDiagnostics, InboxFolderInfo, InvoiceInboxConfig, InvoiceInboxRunSummary } from "@shared/invoice-inbox";
import { apiRequest, invalidateByPrefix } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { InvoiceInboxLogButton } from "./invoice-inbox-log-dialog";

export const INVOICE_INBOX_CONFIG_QUERY_KEY = ["/api/expenses/inbox/config"];
const STATUS_QUERY_KEY = ["/api/expenses/inbox/status"];

type TextField = "host" | "username" | "password" | "inboxFolder" | "processedFolder" | "authservId";
type NumberField = "pollMinutes" | "totalTolerance";

/** Settings card in the E-mail tab: the IMAP mailbox the app reads invoices from. */
export function InvoiceInboxConfigForm() {
  const { t } = useTranslation("expenses");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError, error, refetch, isFetching } = useQuery<InvoiceInboxConfig>({
    queryKey: INVOICE_INBOX_CONFIG_QUERY_KEY,
    queryFn: async () => (await apiRequest("GET", INVOICE_INBOX_CONFIG_QUERY_KEY[0])).json(),
  });
  const { data: status } = useQuery<{ geminiConfigured: boolean }>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: async () => (await apiRequest("GET", STATUS_QUERY_KEY[0])).json(),
    // A refused status is "unknown", not something to hammer: whoever manages
    // settings without manage_expenses still sees the form, just without this.
    retry: false,
  });
  const [form, setForm] = useState<InvoiceInboxConfig | null>(null);
  const [sendersText, setSendersText] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; unseen?: number; folders?: InboxFolderInfo[]; diagnostics?: InboxDiagnostics; message?: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm(data);
    setSendersText(data.allowedSenders.join("\n"));
  }, [data]);

  /** The form as the API expects it: the textarea split into one entry per non-empty line. */
  const payload = (): InvoiceInboxConfig => ({
    ...form!,
    allowedSenders: sendersText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  });

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", INVOICE_INBOX_CONFIG_QUERY_KEY[0], payload())).json(),
    onSuccess: (saved: InvoiceInboxConfig) => {
      queryClient.setQueryData(INVOICE_INBOX_CONFIG_QUERY_KEY, saved);
      invalidateByPrefix("/api/expenses/inbox");
      toast({ title: t("invoiceInbox.config.saved") });
    },
    // M10: the raw server message belongs under a title that says what failed,
    // not in the place of one.
    onError: (e: Error) => toast({ title: t("invoiceInbox.config.saveFailed"), description: e.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/expenses/inbox/config/test", payload())).json(),
    onSuccess: (r: { ok: boolean; unseen: number }) => setTestResult(r),
    onError: (e: Error) => setTestResult({ ok: false, message: e.message }),
  });
  const run = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/expenses/inbox/run")).json(),
    onSuccess: (s: InvoiceInboxRunSummary) => {
      invalidateByPrefix("/api/expenses");
      toast({
        title: t("invoiceInbox.config.runDone", { mails: s.mails, booked: s.booked, review: s.review }),
        description: s.errors.join("\n") || undefined,
        variant: s.errors.length ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: t("invoiceInbox.runFailed"), description: e.message, variant: "destructive" }),
  });

  // The config GET has its own client-side deadline (REQUEST_TIMEOUT_MS,
  // client/src/lib/request-policy.ts) and the query client's global default
  // is `retry: false` (client/src/lib/queryClient.ts) — so a slow answer
  // (a loaded server, a flaky connection) settles into a permanent error,
  // not "still loading". Without this branch the card — including the
  // unrelated "Logboek" button below — stayed blank forever with no way to
  // recover short of a full page reload; found while diagnosing a flaky e2e
  // test (task-6-report.md, part A).
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" />{t("invoiceInbox.config.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm" data-testid="invoice-inbox-config-error">
            {t("invoiceInbox.config.loadFailed")}
            {error instanceof Error && error.message ? `: ${error.message}` : null}
          </div>
          <Button variant="outline" className="mt-3" onClick={() => refetch()} disabled={isFetching} data-testid="button-retry-invoice-inbox-config">
            {isFetching && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.config.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!form) return null;

  const textField = (key: TextField, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`invoice-inbox-${key}`}>{label}</Label>
      <Input id={`invoice-inbox-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={`input-invoice-inbox-${key}`} {...extra} />
    </div>
  );
  const numberField = (key: NumberField, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`invoice-inbox-${key}`}>{label}</Label>
      <Input id={`invoice-inbox-${key}`} type="number" value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} data-testid={`input-invoice-inbox-${key}`} {...extra} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" />{t("invoiceInbox.config.title")}</CardTitle>
        <CardDescription>{t("invoiceInbox.config.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.geminiConfigured && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="invoice-inbox-gemini-warning">
            {t("invoiceInbox.config.geminiMissing")}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} id="invoice-inbox-enabled" data-testid="switch-invoice-inbox-enabled" />
          <Label htmlFor="invoice-inbox-enabled">{t("invoiceInbox.config.enabled")}</Label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {textField("host", t("invoiceInbox.config.host"), { placeholder: "imap.voorbeeld.nl" })}
          <div>
            <Label htmlFor="invoice-inbox-connection">{t("invoiceInbox.config.connection")}</Label>
            <select
              id="invoice-inbox-connection"
              className="flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              value={form.secure ? "tls" : "starttls"}
              onChange={(e) => setForm({ ...form, secure: e.target.value === "tls", port: e.target.value === "tls" ? 993 : 143 })}
            >
              <option value="tls">{t("invoiceInbox.config.connectionTls")}</option>
              <option value="starttls">{t("invoiceInbox.config.connectionStartTls")}</option>
            </select>
          </div>
          {textField("username", t("invoiceInbox.config.username"), { autoComplete: "off", placeholder: "fakturenapp@lamgroep.nl" })}
          {textField("password", t("invoiceInbox.config.password"), { type: "password", autoComplete: "new-password" })}
          {textField("inboxFolder", t("invoiceInbox.config.inboxFolder"), { placeholder: "INBOX" })}
          <div>
            {textField("processedFolder", t("invoiceInbox.config.processedFolder"), { placeholder: "Verwerkt" })}
            <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.config.processedFolderHint")}</p>
          </div>
          {numberField("pollMinutes", t("invoiceInbox.config.pollMinutes"), { min: 5, max: 1440 })}
          {numberField("totalTolerance", t("invoiceInbox.config.totalTolerance"), { min: 0, max: 100, step: "0.01" })}
        </div>
        {/*
          I2: the app can only tell a real sender from a forged one when it
          knows which name its own mail server writes in Authentication-Results.
          Empty means lenient: a mail that merely claims to come from a trusted
          address is booked. Say that out loud rather than hide it.
        */}
        <div>
          {textField("authservId", t("invoiceInbox.config.authservId"), { placeholder: "mx.voorbeeld.nl" })}
          <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.config.authservIdHint")}</p>
          {!form.authservId.trim() && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="invoice-inbox-authserv-warning">
              {t("invoiceInbox.config.authservIdWarning")}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="invoice-inbox-senders">{t("invoiceInbox.config.allowedSenders")}</Label>
          <Textarea id="invoice-inbox-senders" rows={4} value={sendersText} onChange={(e) => setSendersText(e.target.value)} placeholder={"@garage.nl\n@lamgroep.nl"} data-testid="textarea-invoice-inbox-senders" />
          <p className="mt-1 text-xs text-muted-foreground">{t("invoiceInbox.config.allowedSendersHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-invoice-inbox">{t("invoiceInbox.config.save")}</Button>
          <Button variant="outline" onClick={() => { setTestResult(null); test.mutate(); }} disabled={test.isPending || !form.host} data-testid="button-test-invoice-inbox">
            {test.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.config.test")}
          </Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending || !form.host} data-testid="button-run-invoice-inbox">
            {run.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("invoiceInbox.config.runNow")}
          </Button>
          <InvoiceInboxLogButton />
        </div>
        {testResult && (
          <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`} data-testid="invoice-inbox-test-result">
            {testResult.ok ? (
              <>
                <div className="font-medium">{t("invoiceInbox.config.testOk", { count: testResult.unseen ?? 0 })}</div>
                <div>{t("invoiceInbox.config.testAccount", { username: form.username, host: form.host })}</div>
                {/* Where a mail that is NOT picked up sits: the spam folder, or the inbox but already read. */}
                <p className="mt-1 text-muted-foreground">{t("invoiceInbox.config.testHint", { folder: form.inboxFolder || "INBOX" })}</p>
                {(testResult.folders?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-0.5" data-testid="invoice-inbox-test-folders">
                    {testResult.folders!.map((folder) => (
                      <li key={folder.path} className={folder.path === (form.inboxFolder || "INBOX") ? "font-medium" : ""}>
                        {t("invoiceInbox.config.testFolderLine", { path: folder.path, messages: folder.messages, unseen: folder.unseen })}
                      </li>
                    ))}
                  </ul>
                )}
                {testResult.diagnostics && (
                  <>
                    {/* The server's own SEARCH disagrees with the message flags (seen on STRATO): the app reads the flags. */}
                    {testResult.diagnostics.searchUnseen !== null && testResult.diagnostics.searchUnseen < (testResult.unseen ?? 0) && (
                      <p className="mt-2">{t("invoiceInbox.config.testSearchMismatch")}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground" data-testid="invoice-inbox-test-technical">
                      {t("invoiceInbox.config.testTechnical", {
                        server: testResult.diagnostics.server ?? t("invoiceInbox.config.testServerUnknown"),
                        exists: testResult.diagnostics.exists,
                        search: testResult.diagnostics.searchUnseen ?? "?",
                      })}
                    </p>
                  </>
                )}
              </>
            ) : <>{t("invoiceInbox.config.testFailed")}: {testResult.message}</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
