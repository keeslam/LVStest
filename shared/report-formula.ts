/**
 * Shared formula model for calculated report fields (client builder + server SQL compiler).
 * Pure TypeScript: formulas are data trees, never text that reaches SQL.
 */

export type FormulaOp = "+" | "-" | "*" | "/";

export type FormulaNode =
  | { kind: "field"; table: string; field: string; via?: string }
  | { kind: "calc"; id: string }
  | { kind: "number"; value: number }
  | { kind: "op"; op: FormulaOp; left: FormulaNode; right: FormulaNode };

export type IfThenResult = { text: string } | { ref: FormulaNode };

export type IfThenRule = {
  when: { ref: FormulaNode; test: "eq" | "neq" | "gt" | "lt" | "empty"; value?: string | number };
  then: IfThenResult;
  otherwise: IfThenResult;
};

export interface CalculatedField {
  id: string;
  name: string;
  kind: "formula" | "ifThen";
  type: "money" | "number" | "percent" | "text";
  formula?: FormulaNode;
  rule?: IfThenRule;
}

export type FormulaToken =
  | { t: "field"; table: string; field: string; via?: string }
  | { t: "calc"; id: string }
  | { t: "number"; value: number }
  | { t: "op"; op: FormulaOp }
  | { t: "(" }
  | { t: ")" };

export type FieldRef = { table: string; field: string; via?: string };

export const MAX_CALCULATED_FIELDS = 20;
export const MAX_FORMULA_DEPTH = 10;
export const MAX_RULE_TEXT = 100;

export type ParseError = "EMPTY" | "UNBALANCED" | "MISSING_OPERAND" | "MISSING_OPERATOR";

class ParseFail extends Error {
  constructor(public code: ParseError) {
    super(code);
  }
}

export function parseFormula(
  tokens: FormulaToken[],
): { ok: true; node: FormulaNode } | { ok: false; error: ParseError } {
  if (tokens.length === 0) return { ok: false, error: "EMPTY" };

  let depth = 0;
  for (const tk of tokens) {
    if (tk.t === "(") depth++;
    else if (tk.t === ")") {
      depth--;
      if (depth < 0) return { ok: false, error: "UNBALANCED" };
    }
  }
  if (depth !== 0) return { ok: false, error: "UNBALANCED" };

  let pos = 0;

  const parseExpr = (): FormulaNode => {
    let left = parseTerm();
    while (pos < tokens.length) {
      const tk = tokens[pos];
      if (tk.t === "op" && (tk.op === "+" || tk.op === "-")) {
        pos++;
        left = { kind: "op", op: tk.op, left, right: parseTerm() };
      } else break;
    }
    return left;
  };

  const parseTerm = (): FormulaNode => {
    let left = parseFactor();
    while (pos < tokens.length) {
      const tk = tokens[pos];
      if (tk.t === "op" && (tk.op === "*" || tk.op === "/")) {
        pos++;
        left = { kind: "op", op: tk.op, left, right: parseFactor() };
      } else break;
    }
    return left;
  };

  const parseFactor = (): FormulaNode => {
    const tk = tokens[pos];
    if (!tk) throw new ParseFail("MISSING_OPERAND");
    if (tk.t === "(") {
      pos++;
      const inner = parseExpr();
      const close = tokens[pos];
      if (!close || close.t !== ")") throw new ParseFail("MISSING_OPERATOR"); // balance was checked, so an operand is left over
      pos++;
      return inner;
    }
    pos++;
    if (tk.t === "field") {
      const node: FormulaNode = { kind: "field", table: tk.table, field: tk.field };
      if (tk.via) node.via = tk.via;
      return node;
    }
    if (tk.t === "calc") return { kind: "calc", id: tk.id };
    if (tk.t === "number" && Number.isFinite(tk.value)) return { kind: "number", value: tk.value };
    throw new ParseFail("MISSING_OPERAND"); // operator or ")" where an operand belongs
  };

  try {
    const node = parseExpr();
    if (pos < tokens.length) throw new ParseFail("MISSING_OPERATOR");
    return { ok: true, node };
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: e.code };
    throw e;
  }
}

const PRECEDENCE: Record<FormulaOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

export function formulaTokens(node: FormulaNode): FormulaToken[] {
  switch (node.kind) {
    case "field": {
      const tk: FormulaToken = { t: "field", table: node.table, field: node.field };
      if (node.via) tk.via = node.via;
      return [tk];
    }
    case "calc":
      return [{ t: "calc", id: node.id }];
    case "number":
      return [{ t: "number", value: node.value }];
    case "op": {
      const p = PRECEDENCE[node.op];
      const wrap = (child: FormulaNode, isRight: boolean): FormulaToken[] => {
        const inner = formulaTokens(child);
        if (child.kind !== "op") return inner;
        const cp = PRECEDENCE[child.op];
        const needs = cp < p || (isRight && cp === p);
        return needs ? [{ t: "(" }, ...inner, { t: ")" }] : inner;
      };
      return [...wrap(node.left, false), { t: "op", op: node.op }, ...wrap(node.right, true)];
    }
  }
}

type FieldNode = Extract<FormulaNode, { kind: "field" }>;

const OPS: readonly string[] = ["+", "-", "*", "/"];
const TESTS: readonly string[] = ["eq", "neq", "gt", "lt", "empty"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Depth = number of nested operator levels: a lone field or number is depth 0,
 * `a + b` is depth 1, `(a + b) * c` is depth 2. A formula may be at most
 * MAX_FORMULA_DEPTH (10) levels deep; calc references add the depth of the calc they point at.
 */
type Walk =
  | { ok: true; leaves: FormulaNode[]; depth: number }
  | { ok: false; error: "BAD_RULE" | "TOO_DEEP" };

/** Iterative, bounded walk over untrusted input: never recurses, stops at the depth limit. */
function walk(root: unknown): Walk {
  const leaves: FormulaNode[] = [];
  let maxDepth = 0;
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length > 0) {
    const [node, d] = stack.pop()!;
    if (!isObj(node)) return { ok: false, error: "BAD_RULE" };
    switch (node.kind) {
      case "number":
        if (typeof node.value !== "number" || !Number.isFinite(node.value)) return { ok: false, error: "BAD_RULE" };
        leaves.push(node as unknown as FormulaNode);
        break;
      case "field":
        if (typeof node.table !== "string" || typeof node.field !== "string") return { ok: false, error: "BAD_RULE" };
        if (node.via !== undefined && typeof node.via !== "string") return { ok: false, error: "BAD_RULE" };
        leaves.push(node as unknown as FormulaNode);
        break;
      case "calc":
        if (typeof node.id !== "string") return { ok: false, error: "BAD_RULE" };
        leaves.push(node as unknown as FormulaNode);
        break;
      case "op":
        if (typeof node.op !== "string" || !OPS.includes(node.op)) return { ok: false, error: "BAD_RULE" };
        if (d + 1 > MAX_FORMULA_DEPTH) return { ok: false, error: "TOO_DEEP" };
        maxDepth = Math.max(maxDepth, d + 1);
        stack.push([node.right, d + 1], [node.left, d + 1]);
        break;
      default:
        return { ok: false, error: "BAD_RULE" };
    }
  }
  return { ok: true, leaves, depth: maxDepth };
}

/** The expression roots of a calculated field, or null when its shape is malformed. */
function rootsOf(f: unknown): unknown[] | null {
  if (!isObj(f)) return null;
  if (f.kind === "formula") return f.formula === undefined || f.formula === null ? null : [f.formula];
  if (f.kind !== "ifThen") return null;
  const r = f.rule;
  if (!isObj(r) || !isObj(r.when) || !isObj(r.then) || !isObj(r.otherwise)) return null;
  const roots: unknown[] = [r.when.ref];
  for (const res of [r.then, r.otherwise]) {
    if ("ref" in res) roots.push(res.ref);
    else if (typeof res.text !== "string" || res.text.length > MAX_RULE_TEXT) return null;
  }
  const test = r.when.test;
  if (typeof test !== "string" || !TESTS.includes(test)) return null;
  const v = r.when.value;
  if (test === "gt" || test === "lt") {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
  } else if (test !== "empty") {
    const okValue = (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v !== "");
    if (!okValue) return null;
  }
  return roots;
}

/** All field references of all calculated fields (for the permission check). Tolerates malformed input. */
export function referencedFields(fields: CalculatedField[]): FieldNode[] {
  const out: FieldNode[] = [];
  if (!Array.isArray(fields)) return out;
  for (const f of fields) {
    const roots = isObj(f) && f.kind === "ifThen" ? ruleRoots(f.rule) : rootsOf(f);
    for (const root of roots ?? []) {
      const w = walk(root);
      if (w.ok) for (const l of w.leaves) if (isFieldNode(l)) out.push(l);
    }
  }
  return out;
}

function isFieldNode(n: FormulaNode): n is FieldNode {
  return n.kind === "field";
}

/** Roots of a rule without judging its other parts (used by the lenient permission scan). */
function ruleRoots(r: unknown): unknown[] {
  if (!isObj(r)) return [];
  const roots: unknown[] = [];
  if (isObj(r.when)) roots.push(r.when.ref);
  for (const res of [r.then, r.otherwise]) if (isObj(res) && "ref" in res) roots.push(res.ref);
  return roots;
}

export type ValidationError = "UNKNOWN_FIELD" | "CYCLE" | "TOO_DEEP" | "TOO_MANY" | "BAD_RULE";

/** Never throws, whatever the input looks like. */
export function validateCalculatedFields(
  fields: CalculatedField[],
  isKnownField: (ref: FieldRef) => boolean,
): { ok: true } | { ok: false; error: ValidationError; id: string } {
  if (!Array.isArray(fields)) return { ok: false, error: "BAD_RULE", id: "" };
  const idOf = (f: unknown, i: number): string => (isObj(f) && typeof f.id === "string" ? f.id : String(i));
  if (fields.length > MAX_CALCULATED_FIELDS) {
    return { ok: false, error: "TOO_MANY", id: idOf(fields[MAX_CALCULATED_FIELDS], MAX_CALCULATED_FIELDS) };
  }

  const info = new Map<string, { own: number; deps: string[] }>();
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] as unknown;
    const id = idOf(f, i);
    if (!isObj(f) || typeof f.id !== "string" || f.id === "" || info.has(f.id)) return { ok: false, error: "BAD_RULE", id };
    const roots = rootsOf(f);
    if (!roots) return { ok: false, error: "BAD_RULE", id };
    let own = 0;
    const deps: string[] = [];
    for (const root of roots) {
      const w = walk(root);
      if (!w.ok) return { ok: false, error: w.error, id };
      own = Math.max(own, w.depth);
      for (const leaf of w.leaves) {
        if (leaf.kind === "field" && !isKnownField({ table: leaf.table, field: leaf.field, via: leaf.via })) {
          return { ok: false, error: "UNKNOWN_FIELD", id };
        }
        if (leaf.kind === "calc") deps.push(leaf.id);
      }
    }
    info.set(f.id, { own, deps });
  }
  for (const [id, { deps }] of info) {
    if (deps.some((d) => !info.has(d))) return { ok: false, error: "UNKNOWN_FIELD", id };
  }

  // Cycles and total depth through calc references (at most 20 fields, so recursion is shallow).
  const state = new Map<string, "visiting" | "done">();
  const total = new Map<string, number>();
  let failure: { error: "CYCLE" | "TOO_DEEP"; id: string } | null = null;
  const visit = (id: string): number => {
    const st = state.get(id);
    if (st === "visiting") {
      if (!failure) failure = { error: "CYCLE", id };
      return 0;
    }
    if (st === "done") return total.get(id) ?? 0;
    state.set(id, "visiting");
    const { own, deps } = info.get(id)!;
    let deepest = 0;
    for (const d of deps) deepest = Math.max(deepest, visit(d));
    const t = own + deepest;
    if (t > MAX_FORMULA_DEPTH && !failure) failure = { error: "TOO_DEEP", id };
    state.set(id, "done");
    total.set(id, t);
    return t;
  };
  for (const id of info.keys()) {
    visit(id);
    if (failure) return { ok: false, ...(failure as { error: "CYCLE" | "TOO_DEEP"; id: string }) };
  }
  return { ok: true };
}

/** Numeric value of a formula; division by zero or any missing value gives null. */
export function evaluateFormula(
  node: FormulaNode,
  row: (ref: FieldRef) => number | null,
  calcs: CalculatedField[],
  depth = 0,
): number | null {
  if (depth > MAX_FORMULA_DEPTH * 2) return null;
  switch (node.kind) {
    case "number":
      return node.value;
    case "field":
      return row({ table: node.table, field: node.field, via: node.via });
    case "calc": {
      const f = calcs.find((c) => c.id === node.id);
      if (!f || f.kind !== "formula" || !f.formula) return null;
      return evaluateFormula(f.formula, row, calcs, depth + 1);
    }
    case "op": {
      const l = evaluateFormula(node.left, row, calcs, depth + 1);
      const r = evaluateFormula(node.right, row, calcs, depth + 1);
      if (l === null || r === null) return null;
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? null : l / r;
      }
    }
  }
}
