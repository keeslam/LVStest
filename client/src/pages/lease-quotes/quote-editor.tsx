import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, FileText, History, Loader2, ScanText, Trash2, Upload } from "lucide-react";
import { isEditWarningStatus, LEASE_QUOTE_STATUSES, type LeaseQuotePayload } from "@shared/lease-quotes";
import { roundCents, type LeaseCostInputs } from "@shared/lease-quote-calc";
import { UserPermission, type Customer } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CustomerSearchPicker } from "@/components/customers/customer-search-picker";
import { RecordHistoryDialog } from "@/components/audit/record-history-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchWithTimeout, getCsrfToken, invalidateByPrefix, throwIfResNotOk } from "@/lib/queryClient";
import { describeApiError } from "@/lib/api-error";
import { describeLeasePdfError } from "./pdf-error";
import { formatCurrency, formatDateTime } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { CopyQuoteDialog } from "./copy-quote-dialog";
import { DealerScanDialog, type ScanApplied } from "./dealer-scan-dialog";
import { evaluateVariant, formatAmountInput, NumberInput, readNumber, VariantsTable, type NumberRule, type VariantDraft, type VariantField } from "./variants-table";

/* ------------------------------------------------------------------ *
 * The quote as the server sends it, and the form built from it
 * ------------------------------------------------------------------ */

interface QuoteFile {
  id: number;
  kind: "dealer" | "generated";
  fileName: string;
  fileSize: number | null;
  contentType: string | null;
  createdAt: string | null;
  createdBy: string | null;
}

const COST_KEYS = [
  "interestRatePercent", "robPerYear", "otherCostsPerYear", "insurancePerMonth", "roadTaxPerMonth",
  "marginPerMonth", "excessKmPrice", "shortfallKmPrice",
] as const;
const BREAKDOWN_KEYS = ["catalogPrice", "options", "discount", "bpm", "deliveryCosts", "totalExclVat", "totalInclVat"] as const;
const PROSPECT_KEYS = ["prospectName", "prospectCompany", "prospectEmail", "prospectPhone"] as const;
const VEHICLE_KEYS = ["vehicleMake", "vehicleModel", "vehicleTrim", "licensePlate", "dealerName", "deliveryTime"] as const;
type CostKey = (typeof COST_KEYS)[number];
type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];
type TextKey = (typeof PROSPECT_KEYS)[number] | (typeof VEHICLE_KEYS)[number] | "vehicleNotes" | "internalNotes";
const TEXT_KEYS: readonly TextKey[] = [...PROSPECT_KEYS, ...VEHICLE_KEYS, "vehicleNotes", "internalNotes"];

export interface LeaseQuoteDetail {
  id: number;
  quoteNumber: string;
  status: string;
  quoteDate: string;
  validUntil: string;
  customerId: number | null;
  customerName: string | null;
  purchasePrice: number | null;
  priceBreakdown: Partial<Record<BreakdownKey, number | null>> | null;
  variants: Array<{ id: number; position: number; termMonths: number; kmPerYear: number; residualValue: number; isChosen: boolean; totalPerMonth: number | null }>;
  files: QuoteFile[];
  [key: string]: unknown;
}

interface FormState {
  status: string;
  quoteDate: string;
  validUntil: string;
  customerMode: "customer" | "prospect";
  customerId: number | null;
  text: Record<TextKey, string>;
  purchasePrice: string;
  costs: Record<CostKey, string>;
  breakdown: Record<BreakdownKey, string>;
  variants: VariantDraft[];
  chosenIndex: number;
}

let variantKeySeq = 0;
const newVariantKey = () => `v${++variantKeySeq}`;

function formFromQuote(q: LeaseQuoteDetail): FormState {
  const variants = q.variants.length
    ? q.variants.map((v) => ({ key: newVariantKey(), term: formatAmountInput(v.termMonths), km: formatAmountInput(v.kmPerYear), residual: formatAmountInput(v.residualValue) }))
    : [{ key: newVariantKey(), term: "48", km: formatAmountInput(20000), residual: "" }];
  const chosen = q.variants.findIndex((v) => v.isChosen);
  return {
    status: q.status,
    quoteDate: q.quoteDate,
    validUntil: q.validUntil,
    customerMode: q.customerId ? "customer" : "prospect",
    customerId: q.customerId,
    text: Object.fromEntries(TEXT_KEYS.map((k) => [k, typeof q[k] === "string" ? (q[k] as string) : ""])) as Record<TextKey, string>,
    purchasePrice: formatAmountInput(q.purchasePrice),
    costs: Object.fromEntries(COST_KEYS.map((k) => [k, formatAmountInput(q[k] as number | null)])) as Record<CostKey, string>,
    breakdown: Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, formatAmountInput(q.priceBreakdown?.[k] ?? null)])) as Record<BreakdownKey, string>,
    variants,
    chosenIndex: chosen >= 0 ? chosen : 0,
  };
}

const BREAKDOWN_RULE: Record<BreakdownKey, NumberRule> = {
  catalogPrice: "amount", options: "amount", discount: "signed", bpm: "amount", deliveryCosts: "amount", totalExclVat: "amount", totalInclVat: "amount",
};

type BlockReason = "invalid" | "variants" | "dates" | null;

/** Why the form cannot be saved yet, in order of what to fix first; null when it can. */
function blockReason(form: FormState, costsInputs: LeaseCostInputs): BlockReason {
  const numbersInvalid =
    readNumber(form.purchasePrice).invalid ||
    COST_KEYS.some((k) => readNumber(form.costs[k]).invalid) ||
    BREAKDOWN_KEYS.some((k) => readNumber(form.breakdown[k], BREAKDOWN_RULE[k]).invalid) ||
    form.variants.some((v) => evaluateVariant(costsInputs, v).invalid);
  if (numbersInvalid) return "invalid";
  if (form.variants.some((v) => !evaluateVariant(costsInputs, v).complete)) return "variants";
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(form.quoteDate) || !iso.test(form.validUntil)) return "dates";
  return null;
}

/** The whole quote for PATCH: every field and every variant, exactly one chosen. Only call when blockReason is null. */
export function buildPayload(form: FormState): LeaseQuotePayload {
  const text = (k: TextKey) => (form.text[k].trim() === "" ? null : form.text[k].trim());
  const num = (s: string, rule: NumberRule = "amount") => readNumber(s, rule).value;
  const breakdown = Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, num(form.breakdown[k], BREAKDOWN_RULE[k])])) as Record<BreakdownKey, number | null>;
  return {
    status: form.status as LeaseQuotePayload["status"],
    quoteDate: form.quoteDate,
    validUntil: form.validUntil,
    // The switch decides which one counts; the prospect fields are kept either way.
    customerId: form.customerMode === "customer" ? form.customerId : null,
    prospectName: text("prospectName"),
    prospectCompany: text("prospectCompany"),
    prospectEmail: text("prospectEmail"),
    prospectPhone: text("prospectPhone"),
    vehicleMake: text("vehicleMake"),
    vehicleModel: text("vehicleModel"),
    vehicleTrim: text("vehicleTrim"),
    licensePlate: text("licensePlate"),
    dealerName: text("dealerName"),
    deliveryTime: text("deliveryTime"),
    vehicleNotes: text("vehicleNotes"),
    internalNotes: text("internalNotes"),
    purchasePrice: num(form.purchasePrice),
    priceBreakdown: Object.values(breakdown).every((v) => v === null) ? null : breakdown,
    ...(Object.fromEntries(COST_KEYS.map((k) => [k, num(form.costs[k])])) as Record<CostKey, number | null>),
    variants: form.variants.map((v, i) => ({
      termMonths: num(v.term, "positiveInt") as number,
      kmPerYear: num(v.km, "positiveInt") as number,
      residualValue: num(v.residual) as number,
      isChosen: i === form.chosenIndex,
    })),
  };
}

function costInputs(form: FormState): LeaseCostInputs {
  const n = (s: string) => readNumber(s).value ?? 0;
  return {
    purchasePrice: n(form.purchasePrice),
    interestRatePercent: n(form.costs.interestRatePercent),
    robPerYear: n(form.costs.robPerYear),
    otherCostsPerYear: n(form.costs.otherCostsPerYear),
    insurancePerMonth: n(form.costs.insurancePerMonth),
    roadTaxPerMonth: n(form.costs.roadTaxPerMonth),
    marginPerMonth: n(form.costs.marginPerMonth),
  };
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const UPLOAD_TIMEOUT_MS = 120_000;

async function uploadDealerFile(quoteId: number, file: File): Promise<QuoteFile> {
  const body = new FormData();
  body.append("file", file);
  const headers: Record<string, string> = {};
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  // No Content-Type: the browser sets the multipart boundary itself.
  const res = await fetchWithTimeout(`/api/lease-quotes/${quoteId}/files`, { method: "POST", headers, body, credentials: "include" }, UPLOAD_TIMEOUT_MS);
  await throwIfResNotOk(res);
  return res.json();
}

/* ------------------------------------------------------------------ *
 * The dialog
 * ------------------------------------------------------------------ */

interface QuoteEditorProps {
  /** The quote to edit; null = closed. */
  quoteId: number | null;
  onClose: () => void;
  /** Opens another quote in the editor (the copy just made). */
  onOpenQuote: (id: number) => void;
}

export function QuoteEditor({ quoteId, onClose, onOpenQuote }: QuoteEditorProps) {
  const { t } = useTranslation("leaseQuotes");
  const guard = useUnsavedChangesGuard({ close: onClose });
  return (
    <>
      <Dialog open={quoteId !== null} onOpenChange={guard.onOpenChange}>
        {/* Fixed header and action bar, only the middle scrolls: a sticky bar
            inside a padded scroll box let fields show underneath it. */}
        <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:p-0" data-testid="dialog-lease-quote-editor">
          {quoteId !== null && (
            <EditorBody key={quoteId} quoteId={quoteId} setDirty={guard.setDirty} requestClose={guard.requestClose} onOpenQuote={onOpenQuote} />
          )}
          {quoteId === null && <DialogTitle className="sr-only">{t("title")}</DialogTitle>}
        </DialogContent>
      </Dialog>
      <ConfirmDialog {...guard.confirmProps} />
    </>
  );
}

type After = "save" | "pdf" | "copy";

function EditorBody({ quoteId, setDirty: reportDirty, requestClose, onOpenQuote }: {
  quoteId: number;
  setDirty: (dirty: boolean) => void;
  requestClose: () => void;
  onOpenQuote: (id: number) => void;
}) {
  const { t } = useTranslation("leaseQuotes");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/lease-quotes/${quoteId}`;
  const { data: quote, isLoading, isError } = useQuery<LeaseQuoteDetail>({ queryKey: [url] });

  const [form, setForm] = useState<FormState | null>(null);
  // The status as the server last gave it: only that decides the "already sent" question.
  const [loadedStatus, setLoadedStatus] = useState<string>("concept");
  const [dirty, setDirtyState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAfter, setPendingAfter] = useState<After | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanFile, setScanFile] = useState<{ id: number; fileName: string } | null>(null);
  const [deleteFile, setDeleteFile] = useState<QuoteFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The form is built once from the server copy; refetches (after an upload or a PDF) only refresh the file lists.
  useEffect(() => {
    if (quote && form === null) {
      setForm(formFromQuote(quote));
      setLoadedStatus(quote.status);
    }
  }, [quote, form]);

  useEffect(() => { reportDirty(dirty); }, [dirty, reportDirty]);

  const canListCustomers = useHasPermission(UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS);
  const { data: customerList = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: canListCustomers && form?.customerMode === "customer",
  });
  const customers = useMemo(() => {
    // The linked customer stays visible even when the list is not there (yet).
    if (!form?.customerId || customerList.some((c) => c.id === form.customerId)) return customerList;
    const name = quote?.customerId === form.customerId ? quote.customerName ?? `#${form.customerId}` : `#${form.customerId}`;
    return [...customerList, { id: form.customerId, name, companyName: null, debtorNumber: null, email: null } as unknown as Customer];
  }, [customerList, form?.customerId, quote]);

  const costs = useMemo(() => (form ? costInputs(form) : null), [form]);
  const reason = form && costs ? blockReason(form, costs) : null;

  const update = (fn: (f: FormState) => FormState) => {
    setForm((cur) => (cur ? fn(cur) : cur));
    setDirtyState(true);
  };
  const setText = (k: TextKey, v: string) => update((f) => ({ ...f, text: { ...f.text, [k]: v } }));

  const refreshQuote = () => queryClient.invalidateQueries({ queryKey: [url] });

  /* ---------------- save / pdf / copy ---------------- */

  async function saveNow(current: FormState) {
    const res = await apiRequest("PATCH", url, buildPayload(current));
    const saved = (await res.json()) as LeaseQuoteDetail;
    queryClient.setQueryData([url], saved);
    // The list shows the chosen price and status.
    void invalidateByPrefix("/api/lease-quotes");
    setForm(formFromQuote(saved));
    setLoadedStatus(saved.status);
    setDirtyState(false);
    reportDirty(false);
  }

  async function makePdf(tab: Window | null) {
    try {
      const file = (await (await apiRequest("POST", `${url}/pdf`, {})).json()) as { id: number };
      const fileUrl = `${url}/files/${file.id}`;
      void refreshQuote();
      if (tab && !tab.closed) {
        tab.location.href = fileUrl;
        toast({ title: t("pdf.done", { number: quote?.quoteNumber ?? "" }) });
      } else {
        toast({
          title: t("pdf.done", { number: quote?.quoteNumber ?? "" }),
          description: <a href={fileUrl} target="_blank" rel="noopener" className="underline" data-testid="link-lease-quote-pdf">{t("pdf.open")}</a>,
        });
      }
    } catch (error) {
      tab?.close();
      toast({ title: t("pdf.failed"), description: describeLeasePdfError(error, t), variant: "destructive" });
    }
  }

  /** Runs inside the click (button or "Ja"), so the PDF tab is opened before anything is awaited. */
  async function proceed(after: After, save: boolean) {
    if (!form) return;
    const tab = after === "pdf" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    try {
      if (save) {
        try {
          await saveNow(form);
        } catch (error) {
          tab?.close();
          toast({ title: t("editor.saveFailed"), description: describeApiError(error), variant: "destructive" });
          return;
        }
        if (after === "save") toast({ title: t("editor.saved") });
      }
      if (after === "pdf") await makePdf(tab);
      if (after === "copy") setCopyOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function request(after: After) {
    if (!form) return;
    const needsSave = after === "save" || dirty;
    if (!needsSave) { void proceed(after, false); return; }
    if (reason) { toast({ title: t(`editor.blocked.${reason}`), variant: "destructive" }); return; }
    if (isEditWarningStatus(loadedStatus)) { setPendingAfter(after); return; }
    void proceed(after, true);
  }

  /* ---------------- files ---------------- */

  const upload = useMutation({
    mutationFn: (file: File) => uploadDealerFile(quoteId, file),
    onSuccess: (row) => {
      void refreshQuote();
      setScanFile({ id: row.id, fileName: row.fileName });
    },
    onError: (error) => toast({ title: t("editor.files.uploadFailed"), description: describeApiError(error), variant: "destructive" }),
  });

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!UPLOAD_TYPES.includes(file.type)) { toast({ title: t("editor.files.wrongType"), variant: "destructive" }); return; }
    if (file.size > MAX_UPLOAD_BYTES) { toast({ title: t("editor.files.tooLarge"), variant: "destructive" }); return; }
    upload.mutate(file);
  }

  const removeFile = useMutation({
    mutationFn: async (file: QuoteFile) => (await apiRequest("DELETE", `${url}/files/${file.id}`)).json(),
    onSuccess: () => { void refreshQuote(); toast({ title: t("editor.files.deleted") }); },
    onError: (error) => toast({ title: t("editor.files.deleteFailed"), description: describeApiError(error), variant: "destructive" }),
  });

  function applyScan(applied: ScanApplied) {
    update((f) => {
      const text = { ...f.text };
      for (const [k, v] of Object.entries(applied.text)) text[k as TextKey] = v as string;
      if (applied.notesLine) text.vehicleNotes = text.vehicleNotes.trim() ? `${text.vehicleNotes.trimEnd()}\n${applied.notesLine}` : applied.notesLine;
      const breakdown = { ...f.breakdown };
      for (const [k, v] of Object.entries(applied.breakdown)) breakdown[k as BreakdownKey] = formatAmountInput(v as number);
      return {
        ...f,
        text,
        breakdown,
        purchasePrice: applied.purchasePrice !== undefined ? formatAmountInput(applied.purchasePrice) : f.purchasePrice,
      };
    });
    setScanFile(null);
    toast({ title: t("scan.applied") });
  }

  /* ---------------- render ---------------- */

  if (isLoading || (quote && !form)) {
    return (
      <div className="p-6">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription className="sr-only">{t("editor.description")}</DialogDescription></DialogHeader>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }
  if (isError || !quote || !form || !costs) {
    return (
      <div className="p-6">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription className="sr-only">{t("editor.description")}</DialogDescription></DialogHeader>
        <p className="py-8 text-center text-destructive">{t("editor.loadFailed")}</p>
      </div>
    );
  }

  const dealerFiles = quote.files.filter((f) => f.kind === "dealer");
  const generatedFiles = quote.files.filter((f) => f.kind === "generated");
  const chosenView = evaluateVariant(costs, form.variants[form.chosenIndex]);

  const textField = (k: TextKey, className?: string) => (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={`lq-${k}`}>{t(`editor.fields.${k}`)}</Label>
      <Input id={`lq-${k}`} value={form.text[k]} onChange={(e) => setText(k, e.target.value)} data-testid={`input-${k}`} />
    </div>
  );
  const costField = (k: CostKey) => (
    <div key={k} className="space-y-1">
      <Label htmlFor={`lq-${k}`}>{t(`editor.fields.${k}`)}</Label>
      <NumberInput id={`lq-${k}`} value={form.costs[k]} onChange={(v) => update((f) => ({ ...f, costs: { ...f.costs, [k]: v } }))} testId={`input-${k}`} />
    </div>
  );

  const fileRow = (file: QuoteFile) => {
    const fileUrl = `${url}/files/${file.id}`;
    return (
      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid={`row-lease-file-${file.id}`}>
        <div className="min-w-0">
          <p className="truncate font-medium">{file.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {t("editor.files.by", { date: file.createdAt ? formatDateTime(file.createdAt) : "–", user: file.createdBy || "–" })}
          </p>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={t("editor.files.open")}>
            <a href={fileUrl} target="_blank" rel="noopener" aria-label={t("editor.files.open")} data-testid={`link-open-lease-file-${file.id}`}><ExternalLink className="h-4 w-4" /></a>
          </Button>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={t("editor.files.download")}>
            <a href={fileUrl} download={file.fileName} aria-label={t("editor.files.download")} data-testid={`link-download-lease-file-${file.id}`}><Download className="h-4 w-4" /></a>
          </Button>
          {file.kind === "dealer" && (
            <>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={t("editor.files.scan")} aria-label={t("editor.files.scan")} onClick={() => setScanFile({ id: file.id, fileName: file.fileName })} data-testid={`button-scan-lease-file-${file.id}`}>
                <ScanText className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={t("editor.files.delete")} aria-label={t("editor.files.delete")} onClick={() => setDeleteFile(file)} data-testid={`button-delete-lease-file-${file.id}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, children: React.ReactNode, testId: string) => (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0" data-testid={testId}>
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );

  return (
    <>
      <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6 pr-12">
        <DialogTitle className="flex flex-wrap items-center gap-3">
          {t("editor.title", { number: quote.quoteNumber })}
          <span className="text-base font-normal text-muted-foreground" data-testid="text-lease-chosen-total">
            {t("editor.chosenTotal", { amount: chosenView.result.totalPerMonth === null ? "—" : formatCurrency(roundCents(chosenView.result.totalPerMonth)) })}
          </span>
        </DialogTitle>
        <DialogDescription>{t("editor.description")}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4" data-testid="lease-quote-editor-scroll">
        {section(t("editor.sections.customer"), (
          <>
            <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label={t("editor.sections.customer")}>
              {(["customer", "prospect"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={form.customerMode === mode ? "default" : "ghost"}
                  role="radio"
                  aria-checked={form.customerMode === mode}
                  onClick={() => update((f) => ({ ...f, customerMode: mode }))}
                  data-testid={`button-customer-mode-${mode}`}
                >
                  {t(`editor.customerMode.${mode}`)}
                </Button>
              ))}
            </div>
            {form.customerMode === "customer" ? (
              canListCustomers || form.customerId ? (
                <CustomerSearchPicker
                  customers={customers}
                  value={form.customerId}
                  onChange={(id) => update((f) => ({ ...f, customerId: id }))}
                  searchPlaceholder={t("editor.customer.search")}
                  emptyText={t("editor.customer.none")}
                  changeLabel={t("editor.customer.change")}
                  hintText={(shown, total) => t("editor.customer.more", { shown, total })}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("editor.customer.noAccess")}</p>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {PROSPECT_KEYS.map((k) => <div key={k}>{textField(k)}</div>)}
              </div>
            )}
          </>
        ), "section-lease-customer")}

        {section(t("editor.sections.vehicle"), (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {VEHICLE_KEYS.map((k) => <div key={k}>{textField(k)}</div>)}
            </div>
            <div className="space-y-1">
              <Label htmlFor="lq-vehicleNotes">{t("editor.fields.vehicleNotes")}</Label>
              <Textarea id="lq-vehicleNotes" rows={2} value={form.text.vehicleNotes} onChange={(e) => setText("vehicleNotes", e.target.value)} data-testid="input-vehicleNotes" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium">{t("editor.files.dealerTitle")}</h4>
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
                  data-testid="input-dealer-file"
                />
                <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileInput.current?.click()} data-testid="button-upload-dealer-quote">
                  {upload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {upload.isPending ? t("editor.files.uploading") : t("editor.files.upload")}
                </Button>
              </div>
              {dealerFiles.length === 0
                ? <p className="text-sm text-muted-foreground">{t("editor.files.none")}</p>
                : <ul className="divide-y rounded-md border">{dealerFiles.map(fileRow)}</ul>}
            </div>
          </>
        ), "section-lease-vehicle")}

        {section(t("editor.sections.purchase"), (
          <>
            <div className="max-w-sm space-y-1">
              <Label htmlFor="lq-purchasePrice">{t("editor.fields.purchasePrice")}</Label>
              <NumberInput id="lq-purchasePrice" value={form.purchasePrice} onChange={(v) => update((f) => ({ ...f, purchasePrice: v }))} testId="input-purchasePrice" />
            </div>
            <details className="rounded-md border px-3 py-2" open={BREAKDOWN_KEYS.some((k) => form.breakdown[k] !== "")}>
              <summary className="cursor-pointer text-sm font-medium">{t("editor.breakdown.title")}</summary>
              <p className="mt-1 text-xs text-muted-foreground">{t("editor.breakdown.hint")}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-4">
                {BREAKDOWN_KEYS.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`lq-breakdown-${k}`}>{t(`editor.breakdown.${k}`)}</Label>
                    <NumberInput id={`lq-breakdown-${k}`} rule={BREAKDOWN_RULE[k]} value={form.breakdown[k]} onChange={(v) => update((f) => ({ ...f, breakdown: { ...f.breakdown, [k]: v } }))} testId={`input-breakdown-${k}`} />
                  </div>
                ))}
              </div>
            </details>
          </>
        ), "section-lease-purchase")}

        {section(t("editor.sections.costs"), (
          <div className="grid gap-3 sm:grid-cols-4">{COST_KEYS.map(costField)}</div>
        ), "section-lease-costs")}

        {section(t("editor.sections.variants"), (
          <VariantsTable
            variants={form.variants}
            chosenIndex={form.chosenIndex}
            costs={costs}
            onChange={(i, field: VariantField, text) => update((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, [field]: text } : v)) }))}
            onAdd={() => update((f) => {
              const last = f.variants[f.variants.length - 1];
              return { ...f, variants: [...f.variants, { key: newVariantKey(), term: last?.term ?? "48", km: last?.km ?? formatAmountInput(20000), residual: "" }] };
            })}
            onDuplicate={(i) => update((f) => ({ ...f, variants: [...f.variants.slice(0, i + 1), { ...f.variants[i], key: newVariantKey() }, ...f.variants.slice(i + 1)], chosenIndex: f.chosenIndex > i ? f.chosenIndex + 1 : f.chosenIndex }))}
            onRemove={(i) => {
              // Removing the variant that goes to the customer silently moves "Naar de klant" to variant 1: say so.
              if (form.variants.length > 1 && form.chosenIndex === i) toast({ title: t("editor.chosenVariantRemoved") });
              update((f) => {
              if (f.variants.length <= 1) return f;
              const chosenIndex = f.chosenIndex === i ? 0 : f.chosenIndex > i ? f.chosenIndex - 1 : f.chosenIndex;
              return { ...f, variants: f.variants.filter((_, j) => j !== i), chosenIndex };
              });
            }}
            onChoose={(i) => update((f) => ({ ...f, chosenIndex: i }))}
          />
        ), "section-lease-variants")}

        {section(t("editor.sections.quote"), (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="lq-status">{t("editor.fields.status")}</Label>
                <Select value={form.status} onValueChange={(v) => update((f) => ({ ...f, status: v }))}>
                  <SelectTrigger id="lq-status" data-testid="select-lease-quote-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEASE_QUOTE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="lq-quoteDate">{t("editor.fields.quoteDate")}</Label>
                <Input id="lq-quoteDate" type="date" value={form.quoteDate} onChange={(e) => update((f) => ({ ...f, quoteDate: e.target.value }))} data-testid="input-quoteDate" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lq-validUntil">{t("editor.fields.validUntil")}</Label>
                <Input id="lq-validUntil" type="date" value={form.validUntil} onChange={(e) => update((f) => ({ ...f, validUntil: e.target.value }))} data-testid="input-validUntil" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lq-internalNotes">{t("editor.fields.internalNotes")}</Label>
              <Textarea id="lq-internalNotes" rows={2} value={form.text.internalNotes} onChange={(e) => setText("internalNotes", e.target.value)} data-testid="input-internalNotes" />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("editor.files.generatedTitle")}</h4>
              {generatedFiles.length === 0
                ? <p className="text-sm text-muted-foreground">{t("editor.files.noneGenerated")}</p>
                : <ul className="divide-y rounded-md border">{generatedFiles.map(fileRow)}</ul>}
            </div>
          </>
        ), "section-lease-quote")}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-6 py-3">
        {reason && <p className="w-full text-sm text-destructive" data-testid="text-lease-save-blocked">{t(`editor.blocked.${reason}`)}</p>}
        <Button type="button" disabled={busy || reason !== null} onClick={() => request("save")} data-testid="button-save-lease-quote">
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("editor.actions.save")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => request("pdf")} data-testid="button-pdf-lease-quote">
          <FileText className="h-4 w-4 mr-2" />{t("editor.actions.pdf")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => request("copy")} data-testid="button-copy-lease-quote">
          <Copy className="h-4 w-4 mr-2" />{t("editor.actions.copy")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setHistoryOpen(true)} data-testid="button-history-lease-quote">
          <History className="h-4 w-4 mr-2" />{t("editor.actions.history")}
        </Button>
        <Button type="button" variant="ghost" className="ml-auto" onClick={requestClose} data-testid="button-close-lease-quote">
          {t("editor.actions.close")}
        </Button>
      </div>

      <ConfirmDialog
        open={pendingAfter !== null}
        onOpenChange={(open) => { if (!open) setPendingAfter(null); }}
        title={loadedStatus === "accepted" ? t("editor.editWarning.accepted") : t("editor.editWarning.sent")}
        description={t("editor.editWarning.description")}
        confirmLabel={t("editor.editWarning.yes")}
        cancelLabel={t("editor.editWarning.no")}
        variant="warning"
        confirmTestId="button-confirm-edit-warning"
        onConfirm={() => { const after = pendingAfter; setPendingAfter(null); if (after) void proceed(after, true); }}
      />

      <ConfirmDialog
        open={deleteFile !== null}
        onOpenChange={(open) => { if (!open) setDeleteFile(null); }}
        title={t("editor.files.deleteTitle")}
        description={t("editor.files.deleteDescription", { name: deleteFile?.fileName ?? "" })}
        confirmLabel={t("editor.files.delete")}
        confirmTestId="button-confirm-delete-lease-file"
        onConfirm={() => { if (deleteFile) removeFile.mutate(deleteFile); setDeleteFile(null); }}
      />

      <DealerScanDialog quoteId={quoteId} file={scanFile} onClose={() => setScanFile(null)} onApply={applyScan} />

      <CopyQuoteDialog
        quoteId={copyOpen ? quoteId : null}
        onOpenChange={(open) => { if (!open) setCopyOpen(false); }}
        onCopied={(created) => onOpenQuote(created.id)}
      />

      <RecordHistoryDialog
        resourceType="lease_quote"
        resourceId={historyOpen ? quoteId : null}
        label={quote.quoteNumber}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
