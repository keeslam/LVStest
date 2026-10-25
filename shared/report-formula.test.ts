import { describe, it, expect } from "vitest";
import {
  parseFormula, formulaTokens, validateCalculatedFields, evaluateFormula, referencedFields,
  type FormulaToken, type FormulaNode, type CalculatedField,
} from "./report-formula";

const f = (field: string): FormulaToken => ({ t: "field", table: "reservations", field });
const op = (o: "+" | "-" | "*" | "/"): FormulaToken => ({ t: "op", op: o });
const fn = (field: string): FormulaNode => ({ kind: "field", table: "reservations", field });

describe("parseFormula", () => {
  it("parses a minus", () => {
    const r = parseFormula([f("omzet"), op("-"), f("kosten")]);
    expect(r).toEqual({ ok: true, node: { kind: "op", op: "-", left: fn("omzet"), right: fn("kosten") } });
  });
  it("multiplication binds tighter", () => {
    const r = parseFormula([f("a"), op("+"), f("b"), op("*"), f("c")]);
    expect(r).toEqual({
      ok: true,
      node: { kind: "op", op: "+", left: fn("a"), right: { kind: "op", op: "*", left: fn("b"), right: fn("c") } },
    });
  });
  it("parentheses override", () => {
    const r = parseFormula([{ t: "(" }, f("a"), op("+"), f("b"), { t: ")" }, op("*"), f("c")]);
    expect(r).toEqual({
      ok: true,
      node: { kind: "op", op: "*", left: { kind: "op", op: "+", left: fn("a"), right: fn("b") }, right: fn("c") },
    });
  });
  it("is left associative", () => {
    const r = parseFormula([f("a"), op("-"), f("b"), op("-"), f("c")]);
    expect(r).toEqual({
      ok: true,
      node: { kind: "op", op: "-", left: { kind: "op", op: "-", left: fn("a"), right: fn("b") }, right: fn("c") },
    });
  });
  it("reports errors", () => {
    expect(parseFormula([])).toEqual({ ok: false, error: "EMPTY" });
    expect(parseFormula([f("a"), op("+")])).toEqual({ ok: false, error: "MISSING_OPERAND" });
    expect(parseFormula([{ t: "(" }, f("a")])).toEqual({ ok: false, error: "UNBALANCED" });
    expect(parseFormula([f("a"), f("b")])).toEqual({ ok: false, error: "MISSING_OPERATOR" });
  });
  it("round-trips through formulaTokens", () => {
    const cases: FormulaToken[][] = [
      [f("omzet"), op("-"), f("kosten")],
      [f("a"), op("+"), f("b"), op("*"), f("c")],
      [{ t: "(" }, f("a"), op("+"), f("b"), { t: ")" }, op("*"), f("c")],
      [f("a"), op("-"), { t: "(" }, f("b"), op("-"), f("c"), { t: ")" }],
    ];
    for (const tokens of cases) {
      const p = parseFormula(tokens);
      if (!p.ok) throw new Error("parse failed");
      expect(formulaTokens(p.node)).toEqual(tokens);
    }
  });
});

describe("evaluateFormula", () => {
  it("divides by zero to null", () => {
    const node: FormulaNode = { kind: "op", op: "/", left: fn("a"), right: fn("b") };
    expect(evaluateFormula(node, (r) => (r.field === "a" ? 5 : 0), [])).toBeNull();
    expect(evaluateFormula(node, (r) => (r.field === "a" ? 6 : 3), [])).toBe(2);
  });
  it("follows calc references", () => {
    const calcs: CalculatedField[] = [{ id: "x", name: "X", kind: "formula", type: "number", formula: { kind: "number", value: 4 } }];
    const node: FormulaNode = { kind: "op", op: "*", left: { kind: "calc", id: "x" }, right: { kind: "number", value: 2 } };
    expect(evaluateFormula(node, () => null, calcs)).toBe(8);
  });
});

describe("validateCalculatedFields", () => {
  const calc = (id: string, formula: FormulaNode): CalculatedField => ({ id, name: id, kind: "formula", type: "number", formula });
  const known = () => true;
  it("accepts a valid set", () => {
    expect(validateCalculatedFields([calc("a", fn("x"))], known)).toEqual({ ok: true });
  });
  it("detects a cycle", () => {
    const r = validateCalculatedFields([calc("A", { kind: "calc", id: "B" }), calc("B", { kind: "calc", id: "A" })], known);
    expect(r).toMatchObject({ ok: false, error: "CYCLE" });
  });
  it("limits to 20 fields", () => {
    const many = Array.from({ length: 21 }, (_, i) => calc(`c${i}`, fn("x")));
    expect(validateCalculatedFields(many, known)).toMatchObject({ ok: false, error: "TOO_MANY" });
  });
  it("rejects unknown fields", () => {
    expect(validateCalculatedFields([calc("a", fn("x"))], () => false)).toEqual({ ok: false, error: "UNKNOWN_FIELD", id: "a" });
  });
  it("rejects too deep and bad rules", () => {
    let deep: FormulaNode = fn("x");
    for (let i = 0; i < 11; i++) deep = { kind: "op", op: "+", left: deep, right: fn("x") };
    expect(validateCalculatedFields([calc("d", deep)], known)).toMatchObject({ error: "TOO_DEEP" });
    const bad: CalculatedField = {
      id: "r", name: "r", kind: "ifThen", type: "text",
      rule: { when: { ref: fn("x"), test: "gt" }, then: { text: "a" }, otherwise: { text: "b" } },
    };
    expect(validateCalculatedFields([bad], known)).toMatchObject({ error: "BAD_RULE" });
  });
  it("lists referenced fields", () => {
    const refs = referencedFields([calc("a", { kind: "op", op: "+", left: fn("x"), right: { kind: "calc", id: "b" } })]);
    expect(refs).toEqual([fn("x")]);
  });
});

describe("parser hardening", () => {
  const L: FormulaToken = { t: "(" };
  const R: FormulaToken = { t: ")" };
  it("rejects bad parentheses", () => {
    expect(parseFormula([R, L])).toEqual({ ok: false, error: "UNBALANCED" });
    expect(parseFormula([L, R, R])).toEqual({ ok: false, error: "UNBALANCED" });
    expect(parseFormula([L, R])).toEqual({ ok: false, error: "MISSING_OPERAND" });
    expect(parseFormula([L, f("a"), f("b"), R])).toEqual({ ok: false, error: "MISSING_OPERATOR" });
  });
  it("accepts a negative number token", () => {
    const r = parseFormula([f("a"), op("+"), { t: "number", value: -5 }]);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(formulaTokens(r.node)).toEqual([f("a"), op("+"), { t: "number", value: -5 }]);
  });
});

describe("validate hardening", () => {
  const num = (value: number): FormulaNode => ({ kind: "number", value });
  const calc = (id: string, formula: FormulaNode): CalculatedField => ({ id, name: id, kind: "formula", type: "number", formula });
  const known = () => true;
  const rule = (r: unknown): CalculatedField => ({ id: "r", name: "r", kind: "ifThen", type: "text", rule: r as never });
  const chain = (n: number): FormulaNode => {
    let node: FormulaNode = num(1);
    for (let i = 0; i < n; i++) node = { kind: "op", op: "+", left: node, right: num(1) };
    return node;
  };

  it("pins the depth boundary at 10 operator levels", () => {
    expect(validateCalculatedFields([calc("a", chain(10))], known)).toEqual({ ok: true });
    expect(validateCalculatedFields([calc("a", chain(11))], known)).toEqual({ ok: false, error: "TOO_DEEP", id: "a" });
  });
  it("survives a 10000-deep hostile tree", () => {
    expect(validateCalculatedFields([calc("a", chain(10000))], known)).toMatchObject({ error: "TOO_DEEP" });
    const loop: any = { kind: "op", op: "+", right: num(1) };
    loop.left = loop;
    expect(validateCalculatedFields([calc("a", loop)], known)).toMatchObject({ error: "TOO_DEEP" });
  });
  it("never throws on malformed input", () => {
    const bads: unknown[] = [
      null, 5, "x", {}, { id: "a" },
      { id: "a", kind: "formula" },
      { id: "a", kind: "formula", formula: null },
      { id: "a", kind: "formula", formula: 7 },
      { id: "a", kind: "formula", formula: { kind: "weird" } },
      { id: "a", kind: "formula", formula: { kind: "number", value: NaN } },
      { id: "a", kind: "formula", formula: { kind: "number", value: Infinity } },
      { id: "a", kind: "formula", formula: { kind: "op", op: "^", left: num(1), right: num(1) } },
      { id: "a", kind: "formula", formula: { kind: "op", op: "+", left: num(1) } },
      { id: "a", kind: "formula", formula: { kind: "field", table: 1, field: "x" } },
      { id: "a", kind: "ifThen" },
      { id: "a", kind: "ifThen", rule: {} },
      { id: "a", kind: "ifThen", rule: { when: null } },
    ];
    for (const b of bads) {
      let r: any;
      expect(() => { r = validateCalculatedFields([b as never], known); }).not.toThrow();
      expect(r.ok).toBe(false);
    }
    expect(() => validateCalculatedFields(null as never, known)).not.toThrow();
    expect(validateCalculatedFields([calc("a", num(1)), calc("a", num(2))], known)).toMatchObject({ ok: false, error: "BAD_RULE" });
  });
  it("checks if-then rules", () => {
    const when = { ref: fn("x"), test: "empty" as const };
    const ok = rule({ when, then: { text: "a" }, otherwise: { ref: fn("y") } });
    expect(validateCalculatedFields([ok], known)).toEqual({ ok: true });
    expect(validateCalculatedFields([rule({ when, otherwise: { text: "b" } })], known)).toMatchObject({ error: "BAD_RULE" });
    expect(validateCalculatedFields([rule({ when, then: { text: "a" } })], known)).toMatchObject({ error: "BAD_RULE" });
    expect(validateCalculatedFields([rule({ when, then: { text: "x".repeat(101) }, otherwise: { text: "b" } })], known)).toMatchObject({ error: "BAD_RULE" });
    expect(validateCalculatedFields([rule({ when, then: { text: "x".repeat(100) }, otherwise: { text: "b" } })], known)).toEqual({ ok: true });
    const w = (test: string, value?: unknown) => rule({ when: { ref: fn("x"), test, value }, then: { text: "a" }, otherwise: { text: "b" } });
    expect(validateCalculatedFields([w("gt", "abc")], known)).toMatchObject({ error: "BAD_RULE" });
    expect(validateCalculatedFields([w("lt", NaN)], known)).toMatchObject({ error: "BAD_RULE" });
    expect(validateCalculatedFields([w("gt", 5)], known)).toEqual({ ok: true });
    expect(validateCalculatedFields([w("eq", "abc")], known)).toEqual({ ok: true });
    expect(validateCalculatedFields([w("eq")], known)).toMatchObject({ error: "BAD_RULE" });
    expect(validateCalculatedFields([w("empty")], known)).toEqual({ ok: true });
    expect(validateCalculatedFields([w("nope", 1)], known)).toMatchObject({ error: "BAD_RULE" });
  });
  it("catches self reference and unknown calc id", () => {
    expect(validateCalculatedFields([calc("a", { kind: "calc", id: "a" })], known)).toMatchObject({ error: "CYCLE" });
    expect(validateCalculatedFields([calc("a", { kind: "calc", id: "zzz" })], known)).toEqual({ ok: false, error: "UNKNOWN_FIELD", id: "a" });
  });
  it("referencedFields looks inside rules and nested calcs", () => {
    const r = rule({ when: { ref: fn("x"), test: "empty" }, then: { ref: fn("y") }, otherwise: { text: "n" } });
    const nested = calc("n", { kind: "op", op: "+", left: { kind: "op", op: "*", left: fn("p"), right: num(2) }, right: fn("q") });
    const refs = referencedFields([r, nested]);
    expect(refs.map((n) => n.field).sort()).toEqual(["p", "q", "x", "y"]);
  });
  it("propagates null", () => {
    const node: FormulaNode = { kind: "op", op: "*", left: { kind: "op", op: "+", left: fn("a"), right: fn("b") }, right: num(2) };
    expect(evaluateFormula(node, (r) => (r.field === "a" ? 1 : null), [])).toBeNull();
    expect(evaluateFormula({ kind: "calc", id: "missing" }, () => 1, [])).toBeNull();
  });
});
