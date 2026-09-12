/**
 * OPT-021 — the exclusion test *is* the feature.
 *
 * "Een globale letter-sneltoets die afvuurt terwijl de scanner een code intikt
 * is schadelijker dan geen sneltoets." A barcode scanner emulates a keyboard:
 * it types letters into whatever has focus and finishes with Enter. Every bare
 * letter must therefore be dead inside any text entry, and inside the scan
 * field in particular.
 */
import { describe, it, expect } from "vitest";
import { matchShortcut, shouldIgnoreShortcut, SHORTCUTS } from "../keyboard-shortcuts";

/** A minimal DOM stand-in — these helpers run in the node project. */
function element(tagName: string, options: {
  contentEditable?: boolean;
  role?: string;
  insideScanField?: boolean;
} = {}): EventTarget {
  return {
    tagName,
    isContentEditable: !!options.contentEditable,
    getAttribute: (name: string) => (name === "role" ? options.role ?? null : null),
    closest: (selector: string) =>
      options.insideScanField && selector === "[data-scan-input]" ? {} : null,
  } as unknown as EventTarget;
}

const body = element("BODY");

describe("OPT-021 — sneltoetsen blijven van getypte tekst af", () => {
  it("is dead inside an input, a textarea, a select and a contenteditable", () => {
    for (const target of [
      element("INPUT"),
      element("TEXTAREA"),
      element("SELECT"),
      element("DIV", { contentEditable: true }),
      element("DIV", { role: "textbox" }),
      element("DIV", { role: "combobox" }),
    ]) {
      expect(shouldIgnoreShortcut(target)).toBe(true);
      expect(matchShortcut({ key: "n", target })).toBeNull();
      expect(matchShortcut({ key: "s", target })).toBeNull();
      expect(matchShortcut({ key: "/", target })).toBeNull();
    }
  });

  it("is dead in the scan field, whatever element that is", () => {
    const scanField = element("DIV", { insideScanField: true });
    expect(shouldIgnoreShortcut(scanField)).toBe(true);
    // The letters a scanner types are letters this app has shortcuts for.
    for (const key of ["n", "s", "N", "S", "/"]) {
      expect(matchShortcut({ key, target: scanField })).toBeNull();
    }
  });

  it("fires on the page itself", () => {
    expect(matchShortcut({ key: "n", target: body })).toBe("newReservation");
    expect(matchShortcut({ key: "N", target: body })).toBe("newReservation");
    expect(matchShortcut({ key: "s", target: body })).toBe("scan");
    expect(matchShortcut({ key: "/", target: body })).toBe("search");
    expect(matchShortcut({ key: "?", target: body })).toBe("help");
  });

  it("Ctrl+K and Cmd+K reach the search box from anywhere, including a text field", () => {
    expect(matchShortcut({ key: "k", ctrlKey: true, target: body })).toBe("search");
    expect(matchShortcut({ key: "k", metaKey: true, target: element("INPUT") })).toBe("search");
    expect(matchShortcut({ key: "K", ctrlKey: true, target: element("TEXTAREA") })).toBe("search");
  });

  it("ignores a letter that carries a modifier — those are browser shortcuts", () => {
    expect(matchShortcut({ key: "n", ctrlKey: true, target: body })).toBeNull();
    expect(matchShortcut({ key: "s", metaKey: true, target: body })).toBeNull();
    expect(matchShortcut({ key: "n", altKey: true, target: body })).toBeNull();
    // Ctrl+Alt+K is not the search shortcut either.
    expect(matchShortcut({ key: "k", ctrlKey: true, altKey: true, target: body })).toBeNull();
  });

  it("claims nothing it does not handle", () => {
    for (const key of ["a", "Enter", "Escape", "F5", "Tab", "1"]) {
      expect(matchShortcut({ key, target: body })).toBeNull();
    }
  });

  it("a target that is not an element at all is handled, not thrown on", () => {
    expect(shouldIgnoreShortcut(null)).toBe(false);
    expect(shouldIgnoreShortcut(undefined)).toBe(false);
    expect(shouldIgnoreShortcut({} as EventTarget)).toBe(false);
    expect(matchShortcut({ key: "n", target: null })).toBe("newReservation");
  });

  it("the overview lists every shortcut the handler answers to", () => {
    const documented = new Set(SHORTCUTS.map((s) => s.action));
    for (const action of ["search", "newReservation", "scan", "help"] as const) {
      expect(documented.has(action)).toBe(true);
    }
    // Plus the two conventions the report asks to write down.
    expect(documented.has("escape")).toBe(true);
    expect(documented.has("enter")).toBe(true);
  });
});
