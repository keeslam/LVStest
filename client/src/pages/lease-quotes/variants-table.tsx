import { useTranslation } from "react-i18next";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { calculateLeaseVariant, parseDutchAmount, roundCents, type LeaseVariantResult } from "@shared/lease-quote-calc";
import { LEASE_VARIANT_COST_KEYS, type LeaseVariantCostKey } from "@shared/lease-quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Dutch number inputs: the form keeps the typed text, the numbers are derived.
 * ------------------------------------------------------------------ */

const inputFormat = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 4 });

/** 17318 -> "17.318", 97.8 -> "97,8", null -> "": what a Dutch user would type. */
export function formatAmountInput(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "" : inputFormat.format(n);
}

export type NumberRule = "amount" | "signed" | "positiveInt";

/** Empty text is "no value" (valid); text that is not a number, or breaks the rule, is invalid. */
export function readNumber(text: string, rule: NumberRule = "amount"): { value: number | null; invalid: boolean } {
  if (text.trim() === "") return { value: null, invalid: false };
  const n = parseDutchAmount(text);
  if (n === null) return { value: null, invalid: true };
  if (rule === "amount" && n < 0) return { value: null, invalid: true };
  if (rule === "positiveInt" && (!Number.isInteger(n) || n < 1)) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

interface NumberInputProps {
  value: string;
  onChange: (text: string) => void;
  rule?: NumberRule;
  id?: string;
  testId: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Text input for a Dutch number. While focused the typed text stays as it is; on blur a readable
 * number is written back in the usual Dutch form ("17318" -> "17.318"). Unreadable text keeps a red border.
 */
export function NumberInput({ value, onChange, rule = "amount", id, testId, ariaLabel, className }: NumberInputProps) {
  const { invalid } = readNumber(value, rule);
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      aria-label={ariaLabel}
      aria-invalid={invalid ? "true" : undefined}
      className={cn(invalid && "border-destructive focus-visible:ring-destructive", className)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const read = readNumber(value, rule);
        if (!read.invalid && read.value !== null) {
          const formatted = formatAmountInput(read.value);
          if (formatted !== value) onChange(formatted);
        }
      }}
      data-testid={testId}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

/** The eight cost fields every variant carries (typed text, like term / km / residual). */
export const COST_FIELDS = LEASE_VARIANT_COST_KEYS;
export type CostField = LeaseVariantCostKey;

export type VariantDraft = {
  /** Stable React key; not sent to the server. */
  key: string;
  term: string;
  km: string;
  residual: string;
} & Record<CostField, string>;

export type VariantField = "term" | "km" | "residual" | CostField;
type ClientWarning = LeaseVariantResult["warnings"][number] | "residual_missing";

export interface VariantView {
  result: LeaseVariantResult;
  /** Without a residual value no depreciation (and so no total) can be shown. */
  residualMissing: boolean;
  warnings: ClientWarning[];
  /** term, km and residual are all filled in and valid: the variant can be saved. */
  complete: boolean;
  invalid: boolean;
}

/** Empty costs count as 0; unreadable costs are reported through `invalid`. */
export function evaluateVariant(purchasePrice: number, v: VariantDraft): VariantView {
  const term = readNumber(v.term, "positiveInt");
  const km = readNumber(v.km, "positiveInt");
  const residual = readNumber(v.residual, "amount");
  const cost = (k: CostField) => readNumber(v[k], "amount");
  const residualMissing = residual.value === null;
  const result = calculateLeaseVariant({
    purchasePrice,
    interestRatePercent: cost("interestRatePercent").value ?? 0,
    robPerYear: cost("robPerYear").value ?? 0,
    otherCostsPerYear: cost("otherCostsPerYear").value ?? 0,
    insurancePerMonth: cost("insurancePerMonth").value ?? 0,
    roadTaxPerMonth: cost("roadTaxPerMonth").value ?? 0,
    marginPerMonth: cost("marginPerMonth").value ?? 0,
  }, {
    termMonths: term.value ?? 0,
    kmPerYear: km.value ?? 0,
    residualValue: residual.value ?? 0,
  });
  const warnings: ClientWarning[] = result.warnings.slice();
  if (residualMissing) warnings.push("residual_missing");
  return {
    result: residualMissing ? { ...result, depreciation: null, totalPerMonth: null, costPerKm: null } : result,
    residualMissing,
    warnings,
    complete: term.value !== null && km.value !== null && residual.value !== null,
    invalid: term.invalid || km.invalid || residual.invalid || COST_FIELDS.some((k) => cost(k).invalid),
  };
}

const money = (n: number | null) => (n === null ? "—" : formatCurrency(roundCents(n)));

interface VariantsTableProps {
  variants: VariantDraft[];
  chosenIndex: number;
  /** Purchase price of the car: the one number all variants share. */
  purchasePrice: number;
  onChange: (index: number, field: VariantField, text: string) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onChoose: (index: number) => void;
}

/**
 * One column per variant: term, km, residual and the costs are typed in, everything below follows live.
 * Scrolls sideways on a narrow screen; the row labels stay in view.
 */
export function VariantsTable({ variants, chosenIndex, purchasePrice, onChange, onAdd, onDuplicate, onRemove, onChoose }: VariantsTableProps) {
  const { t } = useTranslation("leaseQuotes");
  const views = variants.map((v) => evaluateVariant(purchasePrice, v));

  const resultRows: Array<{ key: string; label: string; cell: (view: VariantView) => React.ReactNode; strong?: boolean }> = [
    { key: "depreciation", label: t("editor.variants.depreciation"), cell: (x) => money(x.result.depreciation) },
    { key: "interest", label: t("editor.variants.interest"), cell: (x) => money(x.result.interest) },
    {
      key: "rob", label: t("editor.variants.rob"), cell: (x) => (
        <>
          {money(x.result.rob)}
          {x.result.robTotalOverTerm !== null && (
            <span className="block text-xs text-muted-foreground">{t("editor.variants.robTotal", { amount: money(x.result.robTotalOverTerm) })}</span>
          )}
        </>
      ),
    },
    { key: "insurance", label: t("editor.variants.insurance"), cell: (x) => money(x.result.insurance) },
    { key: "roadTax", label: t("editor.variants.roadTax"), cell: (x) => money(x.result.roadTax) },
    { key: "otherCosts", label: t("editor.variants.otherCosts"), cell: (x) => money(x.result.otherCosts) },
    { key: "margin", label: t("editor.variants.margin"), cell: (x) => money(x.result.margin) },
    { key: "total", label: t("editor.variants.total"), cell: (x) => money(x.result.totalPerMonth), strong: true },
    { key: "costPerKm", label: t("editor.variants.costPerKm"), cell: (x) => money(x.result.costPerKm) },
  ];

  const inputRows: Array<{ field: VariantField; label: string; rule: NumberRule }> = [
    { field: "term", label: t("editor.variants.term"), rule: "positiveInt" },
    { field: "km", label: t("editor.variants.km"), rule: "positiveInt" },
    { field: "residual", label: t("editor.variants.residual"), rule: "amount" },
    // The costs: prefilled from the settings for a new quote, then the variant's own.
    ...COST_FIELDS.map((field) => ({ field, label: t(`editor.fields.${field}`), rule: "amount" as NumberRule })),
  ];

  const labelCell = "sticky left-0 z-10 bg-background pl-3 pr-4 py-1.5 text-left font-normal text-muted-foreground whitespace-nowrap";
  const colCell = (i: number) => cn("px-2 py-1.5 text-right align-top w-[9.5rem] min-w-[9.5rem]", i === chosenIndex && "bg-primary/5");

  return (
    <div className="space-y-2">
      <div className="w-fit max-w-full overflow-x-auto rounded-md border" data-testid="lease-variants-table">
        <table className="w-max text-sm">
          <thead>
            <tr className="border-b">
              <th className={labelCell} />
              {variants.map((v, i) => (
                <th key={v.key} className={cn(colCell(i), "font-medium whitespace-nowrap")} scope="col">
                  {t("editor.variants.column", { n: i + 1 })}
                  {i === chosenIndex && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">{t("editor.variants.chosen")}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inputRows.map((row) => (
              <tr key={row.field} className={cn(row.field === COST_FIELDS[0] && "border-t")}>
                <th scope="row" className={labelCell}>{row.label}</th>
                {variants.map((v, i) => (
                  <td key={v.key} className={colCell(i)}>
                    <NumberInput
                      value={v[row.field]}
                      rule={row.rule}
                      onChange={(text) => onChange(i, row.field, text)}
                      ariaLabel={`${row.label} – ${t("editor.variants.column", { n: i + 1 })}`}
                      className="h-8 text-right"
                      testId={`input-variant-${row.field}-${i}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {resultRows.map((row) => (
              <tr key={row.key} className={cn((row.strong || row.key === "depreciation") && "border-t", row.strong && "font-semibold")}>
                <th scope="row" className={cn(labelCell, row.strong && "font-semibold text-foreground")}>{row.label}</th>
                {views.map((view, i) => (
                  <td key={variants[i].key} className={cn(colCell(i), "whitespace-nowrap")} data-testid={`variant-${row.key}-${i}`}>
                    {row.cell(view)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t">
              <th scope="row" className={labelCell} />
              {variants.map((v, i) => (
                <td key={v.key} className={colCell(i)}>
                  <div className="flex flex-col items-stretch gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={i === chosenIndex ? "default" : "outline"}
                      role="radio"
                      aria-checked={i === chosenIndex}
                      onClick={() => onChoose(i)}
                      data-testid={`button-choose-variant-${i}`}
                    >
                      {i === chosenIndex
                        ? <><Check className="h-4 w-4" />{t("editor.variants.selected")}</>
                        : t("editor.variants.choose")}
                    </Button>
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title={t("editor.variants.duplicate")} aria-label={t("editor.variants.duplicate")} onClick={() => onDuplicate(i)} data-testid={`button-duplicate-variant-${i}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title={t("editor.variants.remove")} aria-label={t("editor.variants.remove")} disabled={variants.length <= 1} onClick={() => onRemove(i)} data-testid={`button-remove-variant-${i}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={labelCell} />
              {views.map((view, i) => (
                <td key={variants[i].key} className={cn(colCell(i), "text-left")} data-testid={`variant-warnings-${i}`}>
                  {view.warnings.map((w) => (
                    <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{t(`editor.warnings.${w}`)}</p>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAdd} data-testid="button-add-variant">
        <Plus className="h-4 w-4 mr-2" />
        {t("editor.variants.add")}
      </Button>
    </div>
  );
}
