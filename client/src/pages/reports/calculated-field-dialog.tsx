/**
 * Rapporten herontwerp deel 4, Task 3: make or change one calculated field of a report.
 * A sum (Rekensom) is built from buttons into a formula bar of chips ("Bedrag × 1,21"); an
 * if-then rule (Als-dan regel) compares one field and gives a text or a field. Only number
 * fields can be calculated with, so the server's type checks are never hit from here.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Delete } from "lucide-react";
import {
  evaluateFormula, formulaTokens, parseFormula, MAX_RULE_TEXT,
  type CalculatedField, type FormulaNode, type FormulaOp, type FormulaToken, type IfThenResult, type IfThenRule,
} from "@shared/report-formula";
import type { DataSourceField } from "@shared/report-builder-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcValueText, linkedFieldLabel } from "./report-builder-output";

/** A field the calculated field may use: of a ticked source, or (via) of a linked row. */
export interface CalcPickField {
  via?: string;
  field: DataSourceField;
}

type CalcType = CalculatedField["type"];
type RuleTest = IfThenRule["when"]["test"];

/** How an operator is shown: the signs Kees knows from school, not * and /. */
export const OP_SIGNS: Record<FormulaOp, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const OP_BUTTONS: Array<{ op: FormulaOp; id: string }> = [
  { op: "+", id: "plus" }, { op: "-", id: "minus" }, { op: "*", id: "times" }, { op: "/", id: "divide" },
];
const NUMBER_TYPES: CalcType[] = ["money", "number", "percent"];
const NUMBER_TESTS: RuleTest[] = ["eq", "neq", "gt", "lt", "empty"];
const TEXT_TESTS: RuleTest[] = ["eq", "neq", "empty"];
const TEXT = "__text";

/** "1,21" -> 1.21, "1.000,5" -> 1000.5, "100" -> 100; null when it is not a number. */
export function parseDutchNumber(text: string): number | null {
  let s = text.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A number as Kees types it: comma decimal, no thousands dots. */
export function dutchNumberText(n: number): string {
  return String(n).replace(".", ",");
}

/** Whether a calculated field gives a number (a sum, or an if-then with a number field on both sides). */
export function isNumericCalc(calc: CalculatedField | undefined): boolean {
  return !!calc && calc.type !== "text";
}

/** The ids of the calculated fields this one uses. */
export function calcRefsOf(calc: CalculatedField): string[] {
  const out: string[] = [];
  const walk = (n: FormulaNode | undefined) => {
    if (!n) return;
    if (n.kind === "calc") out.push(n.id);
    else if (n.kind === "op") { walk(n.left); walk(n.right); }
  };
  walk(calc.formula);
  if (calc.rule) {
    walk(calc.rule.when?.ref);
    for (const r of [calc.rule.then, calc.rule.otherwise]) if (r && "ref" in r) walk(r.ref);
  }
  return out;
}

const fieldKey = (via: string | undefined, table: string, name: string) => (via ? `${via}:${table}.${name}` : `${table}.${name}`);
const calcKey = (id: string) => `calc:${id}`;

function keyOfNode(node: FormulaNode | undefined): string {
  if (!node) return "";
  if (node.kind === "field") return fieldKey(node.via, node.table, node.field);
  if (node.kind === "calc") return calcKey(node.id);
  return "";
}

interface RefOption {
  key: string;
  label: string;
  numeric: boolean;
  node: FormulaNode;
}

function tokenText(t: TFunction, tk: FormulaToken, options: Map<string, RefOption>): string {
  switch (tk.t) {
    case "field":
      return options.get(fieldKey(tk.via, tk.table, tk.field))?.label ?? linkedFieldLabel(t, tk.via, tk.table, tk.field);
    case "calc":
      return options.get(calcKey(tk.id))?.label ?? tk.id;
    case "number":
      return dutchNumberText(tk.value);
    case "op":
      return OP_SIGNS[tk.op];
    default:
      return tk.t;
  }
}

export function CalculatedFieldDialog({
  initial,
  fields,
  earlier,
  sampleRow,
  onSave,
  onClose,
}: {
  /** The field being changed; none for a new one. */
  initial?: CalculatedField;
  fields: CalcPickField[];
  /** The calculated fields this one may use (those made before it). */
  earlier: CalculatedField[];
  /** The first row of the last result, for Voorbeeld; null when the report did not run yet. */
  sampleRow: Record<string, unknown> | null;
  onSave: (calc: Omit<CalculatedField, "id">) => void;
  onClose: () => void;
}) {
  const { t: rawT } = useTranslation("reports");
  const t = rawT as unknown as TFunction;
  const c = (key: string, options?: Record<string, unknown>) => String(t(`reportBuilderPage.calc.${key}`, options));

  const options = useMemo(() => {
    const list: RefOption[] = [
      ...fields.map(({ via, field }) => ({
        key: fieldKey(via, field.table, field.name),
        label: linkedFieldLabel(t, via, field.table, field.name, field.label),
        numeric: field.type === "number",
        node: { kind: "field", table: field.table, field: field.name, ...(via ? { via } : {}) } as FormulaNode,
      })),
      ...earlier.map((calc) => ({ key: calcKey(calc.id), label: calc.name, numeric: isNumericCalc(calc), node: { kind: "calc", id: calc.id } as FormulaNode })),
    ];
    return new Map(list.map((o) => [o.key, o]));
  }, [fields, earlier, t]);
  const optionList = [...options.values()];

  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<CalculatedField["kind"]>(initial?.kind ?? "formula");
  const [type, setType] = useState<CalcType>(initial?.type ?? "number");
  const [tokens, setTokens] = useState<FormulaToken[]>(() => (initial?.formula ? formulaTokens(initial.formula) : []));
  const [numberDraft, setNumberDraft] = useState("");
  const [numberError, setNumberError] = useState(false);
  const rule = initial?.rule;
  const [whenKey, setWhenKey] = useState(keyOfNode(rule?.when.ref));
  const [test, setTest] = useState<RuleTest>(rule?.when.test ?? "eq");
  const [valueText, setValueText] = useState(
    rule?.when.value === undefined ? "" : typeof rule.when.value === "number" ? dutchNumberText(rule.when.value) : rule.when.value,
  );
  const resultKey = (r: IfThenResult | undefined) => (r && "ref" in r ? keyOfNode(r.ref) : TEXT);
  const resultText = (r: IfThenResult | undefined) => (r && "text" in r ? r.text : "");
  const [thenKey, setThenKey] = useState(resultKey(rule?.then));
  const [thenText, setThenText] = useState(resultText(rule?.then));
  const [otherwiseKey, setOtherwiseKey] = useState(resultKey(rule?.otherwise));
  const [otherwiseText, setOtherwiseText] = useState(resultText(rule?.otherwise));
  const [problem, setProblem] = useState<string | null>(null);

  const parsed = parseFormula(tokens);
  const whenOption = options.get(whenKey);
  const tests = whenOption && !whenOption.numeric ? TEXT_TESTS : NUMBER_TESTS;
  const resultsNumeric = thenKey !== TEXT && otherwiseKey !== TEXT && !!options.get(thenKey)?.numeric && !!options.get(otherwiseKey)?.numeric;
  const numericKind = kind === "formula" || resultsNumeric;
  const effectiveType: CalcType = numericKind ? (type === "text" ? "number" : type) : "text";

  const push = (tk: FormulaToken) => { setTokens((prev) => [...prev, tk]); setProblem(null); };
  const addNumber = () => {
    const n = parseDutchNumber(numberDraft);
    if (n === null) { setNumberError(true); return; }
    push({ t: "number", value: n });
    setNumberDraft("");
    setNumberError(false);
  };

  const preview = (): string => {
    if (!sampleRow) return c("previewNone");
    if (!parsed.ok) return c("previewNoValue");
    const value = evaluateFormula(parsed.node, (ref) => {
      const raw = sampleRow[ref.via ? `${ref.via}.${ref.field}` : ref.field];
      if (raw === null || raw === undefined || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }, earlier);
    return value === null ? c("previewNoValue") : calcValueText(effectiveType, value);
  };

  const buildRule = (): IfThenRule | string => {
    if (!whenOption) return c("ruleIncomplete");
    let value: string | number | undefined;
    if (test !== "empty") {
      if (whenOption.numeric) {
        const n = parseDutchNumber(valueText);
        if (n === null) return c("needNumber");
        value = n;
      } else {
        if (valueText.trim() === "") return c("ruleIncomplete");
        value = valueText.trim();
      }
    }
    const result = (key: string, text: string): IfThenResult | string => {
      if (key === TEXT) return text.length > MAX_RULE_TEXT ? c("textTooLong", { max: MAX_RULE_TEXT }) : { text };
      const opt = options.get(key);
      return opt ? { ref: opt.node } : c("ruleIncomplete");
    };
    const then = result(thenKey, thenText);
    if (typeof then === "string") return then;
    const otherwise = result(otherwiseKey, otherwiseText);
    if (typeof otherwise === "string") return otherwise;
    return { when: { ref: whenOption.node, test, ...(value !== undefined ? { value } : {}) }, then, otherwise };
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { setProblem(c("nameRequired")); return; }
    if (kind === "formula") {
      if (!parsed.ok) return;
      onSave({ name: trimmed, kind, type: effectiveType, formula: parsed.node });
      return;
    }
    const built = buildRule();
    if (typeof built === "string") { setProblem(built); return; }
    onSave({ name: trimmed, kind, type: effectiveType, rule: built });
  };

  const resultPicker = (which: "then" | "otherwise", key: string, setKey: (k: string) => void, text: string, setText: (s: string) => void) => (
    <div className="space-y-2">
      <Label>{c(which)}</Label>
      <Select value={key} onValueChange={(v) => { setKey(v); setProblem(null); }}>
        <SelectTrigger data-testid={`select-calc-${which}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TEXT}>{c("textOption")}</SelectItem>
          {optionList.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {key === TEXT && (
        <Input
          value={text}
          maxLength={MAX_RULE_TEXT}
          onChange={(e) => setText(e.target.value)}
          placeholder={c("textPlaceholder")}
          data-testid={`input-calc-${which}-text`}
        />
      )}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-calculated-field">
        <DialogHeader>
          <DialogTitle>{initial ? c("dialogTitleEdit") : c("dialogTitleNew")}</DialogTitle>
          <DialogDescription>{c("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="calc-name">{c("name")}</Label>
            <Input
              id="calc-name"
              value={name}
              maxLength={100}
              onChange={(e) => { setName(e.target.value); setProblem(null); }}
              placeholder={c("namePlaceholder")}
              data-testid="input-calc-name"
            />
          </div>
          <div className="flex gap-2">
            {(["formula", "ifThen"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                variant={kind === k ? "default" : "outline"}
                aria-pressed={kind === k}
                onClick={() => { setKind(k); setProblem(null); }}
                data-testid={`button-calc-kind-${k}`}
              >
                {c(k === "formula" ? "kindFormula" : "kindIfThen")}
              </Button>
            ))}
          </div>

          {kind === "formula" ? (
            <div className="space-y-3">
              <div>
                <Label>{c("formula")}</Label>
                <div className="mt-1 flex min-h-[44px] flex-wrap items-center gap-1 rounded-md border p-2" data-testid="formula-bar">
                  {tokens.map((tk, i) => (
                    <span key={i}>
                      {i > 0 && " "}
                      <span className={tk.t === "field" || tk.t === "calc" ? "rounded bg-primary/10 px-2 py-0.5 text-sm" : "px-1 text-sm font-medium"}>
                        {tokenText(t, tk, options)}
                      </span>
                    </span>
                  ))}
                </div>
                {!parsed.ok && (
                  <p className="mt-1 text-sm text-destructive" data-testid="formula-error">{c(`parseErrors.${parsed.error}`)}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {OP_BUTTONS.map(({ op, id }) => (
                  <Button key={id} type="button" variant="outline" size="sm" onClick={() => push({ t: "op", op })} data-testid={`button-formula-${id}`}>
                    {OP_SIGNS[op]}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => push({ t: "(" })} data-testid="button-formula-open">(</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => push({ t: ")" })} data-testid="button-formula-close">)</Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTokens((prev) => prev.slice(0, -1))}
                  disabled={tokens.length === 0}
                  data-testid="button-formula-backspace"
                >
                  <Delete className="mr-1 h-4 w-4" aria-hidden="true" />
                  {c("backspace")}
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="calc-number">{c("numberLabel")}</Label>
                  <Input
                    id="calc-number"
                    inputMode="decimal"
                    value={numberDraft}
                    onChange={(e) => { setNumberDraft(e.target.value); setNumberError(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }}
                    placeholder="1,21"
                    data-testid="input-formula-number"
                  />
                </div>
                <Button type="button" variant="outline" onClick={addNumber} data-testid="button-formula-add-number">
                  {c("addNumber")}
                </Button>
              </div>
              {numberError && <p className="text-sm text-destructive" data-testid="formula-number-error">{c("numberInvalid")}</p>}
              <div>
                <Label>{c("fieldsHeading")}</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {optionList.filter((o) => o.numeric).map((o) => (
                    <Button
                      key={o.key}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => push(o.node.kind === "calc" ? { t: "calc", id: o.node.id } : o.node.kind === "field"
                        ? { t: "field", table: o.node.table, field: o.node.field, ...(o.node.via ? { via: o.node.via } : {}) }
                        : { t: "(" })}
                      data-testid={o.node.kind === "calc" ? `button-formula-calc-${o.node.id}` : `button-formula-field-${o.key}`}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="rounded-md bg-muted p-2 text-sm">
                <span className="font-medium">{c("preview")}: </span>
                <span data-testid="calc-preview">{preview()}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>{c("when")}</Label>
                  <Select
                    value={whenKey || undefined}
                    onValueChange={(v) => {
                      setWhenKey(v);
                      setProblem(null);
                      if (!options.get(v)?.numeric && (test === "gt" || test === "lt")) setTest("eq");
                    }}
                  >
                    <SelectTrigger data-testid="select-calc-when-field">
                      <SelectValue placeholder={t("reportBuilderPage.selectFieldPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {optionList.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{c("test")}</Label>
                  <Select value={test} onValueChange={(v) => { setTest(v as RuleTest); setProblem(null); }}>
                    <SelectTrigger data-testid="select-calc-when-test">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tests.map((x) => <SelectItem key={x} value={x}>{c(`tests.${x}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {test !== "empty" && (
                  <div className="space-y-2">
                    <Label htmlFor="calc-when-value">{c("valueLabel")}</Label>
                    <Input
                      id="calc-when-value"
                      value={valueText}
                      maxLength={MAX_RULE_TEXT}
                      inputMode={whenOption?.numeric ? "decimal" : undefined}
                      onChange={(e) => { setValueText(e.target.value); setProblem(null); }}
                      data-testid="input-calc-when-value"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {resultPicker("then", thenKey, setThenKey, thenText, setThenText)}
                {resultPicker("otherwise", otherwiseKey, setOtherwiseKey, otherwiseText, setOtherwiseText)}
              </div>
            </div>
          )}

          <div>
            <Label>{c("type")}</Label>
            <Select value={effectiveType} onValueChange={(v) => setType(v as CalcType)} disabled={!numericKind}>
              <SelectTrigger data-testid="select-calc-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(numericKind ? NUMBER_TYPES : (["text"] as CalcType[])).map((x) => (
                  <SelectItem key={x} value={x}>{c(`types.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {problem && <p className="text-sm text-destructive" data-testid="calc-problem">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-calculated-field">
            {t("reportBuilderPage.cancelButton")}
          </Button>
          <Button onClick={save} disabled={kind === "formula" && !parsed.ok} data-testid="button-save-calculated-field">
            {c("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
