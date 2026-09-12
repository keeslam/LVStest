/**
 * FIX-R (BUG-072, BUG-102) — the two pure rules behind the client XSS fixes.
 *
 * BUG-072: `window.open(expense.receiptUrl)` with a stored
 * `javascript:alert(1)` runs that script on the application's own origin. The
 * guard is a whitelist, and these cases are the reason it is a whitelist and
 * not a `startsWith('javascript:')` check.
 *
 * BUG-102: the report printer writes vehicle, customer and transport fields
 * into an HTML string. `escapeHtml` is what stands between a stored
 * `<img src=x onerror=…>` and an executing one.
 *
 * Node project: both are pure functions. The DOM half of the audit's
 * regression tests lives in the jsdom project.
 */
import { describe, it, expect } from "vitest";
import { isSafeHttpUrl } from "../safe-url";
import { escapeHtml } from "../html-escape";

describe("BUG-072 — which stored links may be opened", () => {
  it("accepts the links this application actually stores", () => {
    expect(isSafeHttpUrl("https://example.com/receipt.pdf")).toBe(true);
    expect(isSafeHttpUrl("http://example.com/receipt.pdf")).toBe(true);
    expect(isSafeHttpUrl("/uploads/receipts/2026/a.pdf")).toBe(true);
    expect(isSafeHttpUrl("uploads/receipts/a.pdf")).toBe(true);
    expect(isSafeHttpUrl("mailto:info@example.com")).toBe(true);
    expect(isSafeHttpUrl("tel:+31201234567")).toBe(true);
  });

  it("refuses every scheme that can execute", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("  javascript:alert(1)  ")).toBe(false);
    expect(isSafeHttpUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("blob:https://example.com/abc")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("about:blank")).toBe(false);
  });

  it("refuses a protocol-relative URL — that is not this origin", () => {
    expect(isSafeHttpUrl("//evil.example/x")).toBe(false);
    expect(isSafeHttpUrl(String.raw`\\evil.example\share`)).toBe(false);
  });

  it("refuses a value carrying raw markup characters — no real link has them", () => {
    expect(isSafeHttpUrl(`/<img src=x onerror=\"alert(1)\">`)).toBe(false);
    expect(isSafeHttpUrl("https://example.com/a\"onmouseover=alert(1)")).toBe(false);
  });

  it("refuses nothing-at-all rather than opening it", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("   ")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(42)).toBe(false);
  });
});

describe("BUG-102 — a report value cannot bring its own markup", () => {
  it("escapes the five characters that matter", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("Renault & Co")).toBe("Renault &amp; Co");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("renders a missing field as nothing, not as the word null", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
  });

  // The audit's own regression test — "a record with <script> in brand must
  // produce no <script> element" — needs a DOM and lives in the jsdom project:
  // client/src/components/__tests__/xss-sinks.test.tsx.
});
