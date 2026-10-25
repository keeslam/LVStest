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
