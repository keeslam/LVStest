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
      pos++; // the matching ")" (balance was checked up front)
      return inner;
    }
    pos++;
    if (tk.t === "field") {
      const node: FormulaNode = { kind: "field", table: tk.table, field: tk.field };
      if (tk.via) node.via = tk.via;
      return node;
    }
    if (tk.t === "calc") return { kind: "calc", id: tk.id };
    if (tk.t === "number") return { kind: "number", value: tk.value };
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

function fieldRoots(f: CalculatedField): FormulaNode[] {
  if (f.kind === "formula") return f.formula ? [f.formula] : [];
  const r = f.rule;
  if (!r) return [];
  const roots: FormulaNode[] = [r.when.ref];
  if ("ref" in r.then) roots.push(r.then.ref);
  if ("ref" in r.otherwise) roots.push(r.otherwise.ref);
  return roots;
}

function collectLeaves(node: FormulaNode, out: FormulaNode[]): void {
  if (node.kind === "op") {
    collectLeaves(node.left, out);
    collectLeaves(node.right, out);
  } else out.push(node);
}

/** All field references of all calculated fields (for the permission check). */
export function referencedFields(fields: CalculatedField[]): FormulaNode[] {
  const leaves: FormulaNode[] = [];
  for (const f of fields) for (const root of fieldRoots(f)) collectLeaves(root, leaves);
  return leaves.filter((n) => n.kind === "field");
}

function treeDepth(node: FormulaNode): number {
  return node.kind === "op" ? 1 + Math.max(treeDepth(node.left), treeDepth(node.right)) : 1;
}

export type ValidationError = "UNKNOWN_FIELD" | "CYCLE" | "TOO_DEEP" | "TOO_MANY" | "BAD_RULE";

export function validateCalculatedFields(
  fields: CalculatedField[],
  isKnownField: (ref: FieldRef) => boolean,
): { ok: true } | { ok: false; error: ValidationError; id: string } {
  if (fields.length > MAX_CALCULATED_FIELDS) {
    return { ok: false, error: "TOO_MANY", id: fields[MAX_CALCULATED_FIELDS].id };
  }
  const byId = new Map(fields.map((f) => [f.id, f] as const));

  // Shape of each field first.
  for (const f of fields) {
    if (f.kind === "formula") {
      if (!f.formula) return { ok: false, error: "BAD_RULE", id: f.id };
    } else {
      const r = f.rule;
      if (!r) return { ok: false, error: "BAD_RULE", id: f.id };
      if (r.when.test !== "empty" && (r.when.value === undefined || r.when.value === "")) {
        return { ok: false, error: "BAD_RULE", id: f.id };
      }
      for (const res of [r.then, r.otherwise]) {
        if ("text" in res && res.text.length > MAX_RULE_TEXT) return { ok: false, error: "BAD_RULE", id: f.id };
      }
    }
  }

  // Unknown references and own tree depth.
  for (const f of fields) {
    for (const root of fieldRoots(f)) {
      if (treeDepth(root) > MAX_FORMULA_DEPTH) return { ok: false, error: "TOO_DEEP", id: f.id };
      const leaves: FormulaNode[] = [];
      collectLeaves(root, leaves);
      for (const leaf of leaves) {
        if (leaf.kind === "field" && !isKnownField({ table: leaf.table, field: leaf.field, via: leaf.via })) {
          return { ok: false, error: "UNKNOWN_FIELD", id: f.id };
        }
        if (leaf.kind === "calc" && !byId.has(leaf.id)) return { ok: false, error: "UNKNOWN_FIELD", id: f.id };
      }
    }
  }

  // Cycles and total depth through calc references.
  const state = new Map<string, "visiting" | "done">();
  const depthOf = new Map<string, number>();
  let failure: { error: "CYCLE" | "TOO_DEEP"; id: string } | null = null;
  const visit = (id: string): number => {
    const st = state.get(id);
    if (st === "visiting") {
      if (!failure) failure = { error: "CYCLE", id };
      return 0;
    }
    if (st === "done") return depthOf.get(id) ?? 0;
    state.set(id, "visiting");
    const f = byId.get(id)!;
    let own = 1;
    const leaves: FormulaNode[] = [];
    for (const root of fieldRoots(f)) {
      own = Math.max(own, treeDepth(root));
      collectLeaves(root, leaves);
    }
    let deepestDep = 0;
    for (const leaf of leaves) if (leaf.kind === "calc") deepestDep = Math.max(deepestDep, visit(leaf.id));
    const total = own + deepestDep;
    if (total > MAX_FORMULA_DEPTH && !failure) failure = { error: "TOO_DEEP", id };
    state.set(id, "done");
    depthOf.set(id, total);
    return total;
  };
  for (const f of fields) {
    visit(f.id);
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
