/**
 * Rapporten herontwerp deel 1, Task 4 - the one print document of a report.
 */
import { describe, it, expect } from "vitest";
import {
  reportDocumentHtml, prepareTableSection, defaultPrintOptions, resolvePrintSections, rowMatchesSearch, mergePrintOptions,
  type PreparedPrintSection,
} from "../report-document-print";

const base = { company: "Autolease Lam", title: "Bekeuringen", period: "1-10-2026 t/m 31-10-2026", filters: [] as string[], landscape: false, printedAt: "25-10-2026 10:00" };

describe("reportDocumentHtml", () => {
  it("prints every row, says when the export was cut short and goes landscape on request", () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`XK-${i}-A`, String(i)]);
    const html = reportDocumentHtml({
      ...base,
      landscape: true,
      sections: [{ kind: "table", title: "Lijst", header: ["Kenteken", "Km"], rows, truncated: true }],
    });
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect(body.match(/<tr>/g)).toHaveLength(120);
    expect(html).toContain("Niet alle regels passen in de export");
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("thead { display: table-header-group; }");
    expect(html).toContain("Gedrukt op 25-10-2026 10:00");
    expect(html).toContain("counter(page)");
  });

  it("prints a tile hint under the value, escaped", () => {
    const html = reportDocumentHtml({ ...base, sections: [{ kind: "tiles", tiles: [{ label: "Extra km", value: "2", hint: "€ 30,00 <b>x</b>" }] }] });
    expect(html).toContain('<div class="tile-hint">€ 30,00 &lt;b&gt;x&lt;/b&gt;</div>');
  });

  it("prints portrait by default and leaves out the note when nothing was cut", () => {
    const html = reportDocumentHtml({ ...base, sections: [{ kind: "table", header: ["A"], rows: [["x"]], truncated: false }] });
    expect(html).toContain("size: A4 portrait");
    expect(html).not.toContain("Niet alle regels");
  });

  it("escapes the title, filters, cells and notes but inserts the chart svg as it is", () => {
    const html = reportDocumentHtml({
      ...base,
      title: "<script>alert(1)</script>",
      filters: ["Auto: <b>x</b>"],
      sections: [
        { kind: "tiles", tiles: [{ label: "<i>a</i>", value: "<u>1</u>" }] },
        { kind: "chart", svg: "<svg id=\"c\"></svg>" },
        { kind: "table", header: ["<h>"], rows: [["<img src=x onerror=1>"]], truncated: false, totals: ["<t>"] },
        { kind: "note", text: "<n>" },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<i>a</i>");
    expect(html).toContain("<svg id=\"c\"></svg>");
    expect(html).toContain("&lt;t&gt;");
    expect(html).toContain("&lt;n&gt;");
  });
});

/** Task 7 (onderhoudsanalyse): more choices in the print dialog. */
describe("print choices", () => {
  const eleven = Array.from({ length: 11 }, (_, i) => [`AB-${String(i).padStart(2, "0")}-CD`, `Auto ${i}`, `€ ${i + 1},00`]);
  const table = (): PreparedPrintSection => prepareTableSection("table-t", {
    kind: "table", id: "t", title: "Auto's", header: ["Kenteken", "Omschrijving", "Totaal"], columnIds: ["plate", "name", "total"],
    allRows: () => ({ rows: eleven, truncated: false }),
    totals: ["Totaal", "", "€ 66,00"],
  }, { rows: eleven, truncated: false, rowKeys: eleven.map((_, i) => `v${i}`) });
  const tiles: PreparedPrintSection = { key: "tiles-0", kind: "tiles", resolved: { kind: "tiles", tiles: [{ label: "Tegel", value: "1" }] } };
  const labels = { pickedTotal: "Totaal (gekozen regels)" };
  const doc = (sections: PreparedPrintSection[], change: (o: ReturnType<typeof defaultPrintOptions>) => void = () => {}) => {
    const options = defaultPrintOptions(sections);
    change(options);
    return reportDocumentHtml({
      ...base, title: options.title || base.title, note: options.note, fontSize: options.fontSize, pageBreakEach: options.pageBreakEach,
      sections: resolvePrintSections(sections, options, labels),
    });
  };
  const body = (html: string) => html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));

  it("prints every row, every column, every section with the plain defaults", () => {
    const html = doc([tiles, table()]);
    expect(body(html).match(/<tr>/g)).toHaveLength(11);
    expect(html).toContain("<td>€ 66,00</td>");
    expect(html).not.toContain("page-break-before");
    expect(html).toContain('<body class="font-normal">');
  });

  it("prints exactly the 2 picked rows of 11 with the total over those 2", () => {
    const html = doc([table()], (o) => { o.perTable["table-t"] = { ...o.perTable["table-t"], rows: "pick", picked: ["v2", "v5"] }; });
    expect(body(html).match(/<tr>/g)).toHaveLength(2);
    expect(html).toContain("AB-02-CD");
    expect(html).toContain("AB-05-CD");
    expect(html).not.toContain("AB-03-CD");
    expect(html).toMatch(/<tfoot><tr><td>Totaal \(gekozen regels\)<\/td><td><\/td><td>€\s9,00<\/td><\/tr><\/tfoot>/);
  });

  it("leaves out a column that is switched off, also in the totals", () => {
    const html = doc([table()], (o) => { o.perTable["table-t"].columns = ["plate", "total"]; });
    expect(html).not.toContain("Omschrijving");
    expect(html).not.toContain("Auto 3");
    expect(html).toContain("<th>Kenteken</th><th>Totaal</th>");
  });

  it("follows the chosen order of the sections and leaves out a section that is off", () => {
    const html = doc([tiles, table()], (o) => { o.order = [...o.order].reverse(); });
    expect(html.indexOf("<table")).toBeLessThan(html.indexOf('class="tiles"'));
    const off = doc([tiles, table()], (o) => { o.sectionOn["tiles-0"] = false; });
    expect(off).not.toContain('class="tiles"');
  });

  it("starts every section on a new page when asked", () => {
    const html = doc([tiles, table()], (o) => { o.pageBreakEach = true; });
    expect(html).toContain("page-break-before");
    expect(html.match(/class="page-part"/g)).toHaveLength(1);
  });

  it("escapes an own title and a note, and sets the font size class", () => {
    const html = doc([table()], (o) => { o.title = "<b>Mijn titel</b>"; o.note = "<i>let op</i>"; o.fontSize = "large"; });
    expect(html).toContain("&lt;b&gt;Mijn titel&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;let op&lt;/i&gt;");
    expect(html).not.toContain("<b>Mijn titel</b>");
    expect(html).toContain('<body class="font-large">');
  });

  it("sorts descending on Totaal as amounts, not as text", () => {
    const html = doc([table()], (o) => { o.perTable["table-t"].sort = { col: "total", dir: "desc" }; });
    const b = body(html);
    expect(b.indexOf("AB-10-CD")).toBeLessThan(b.indexOf("AB-09-CD"));
    expect(b.indexOf("AB-09-CD")).toBeLessThan(b.indexOf("AB-01-CD"));
    expect(b.indexOf("AB-01-CD")).toBeLessThan(b.indexOf("AB-00-CD"));
  });

  it("falls back to row numbers and column headings when a producer gives no keys", () => {
    const plain = prepareTableSection("table-x", { kind: "table", id: "x", header: ["A", "B"], allRows: () => ({ rows: [["1", "2"]], truncated: false }) }, { rows: [["1", "2"]], truncated: false });
    expect(plain.kind === "table" && plain.rowKeys).toEqual(["0"]);
    expect(plain.kind === "table" && plain.columnIds).toEqual(["A", "B"]);
  });

  it("finds a plate in the pick list without its dashes", () => {
    expect(rowMatchesSearch(["AB-12-CD", "Golf"], "ab12cd")).toBe(true);
    expect(rowMatchesSearch(["AB-12-CD", "Golf"], "AB-12")).toBe(true);
    expect(rowMatchesSearch(["AB-12-CD", "Golf"], "xy99")).toBe(false);
  });

  it("remembers the columns that were switched off, so a new column comes on and an old choice stays", () => {
    const saved = defaultPrintOptions([table()]);
    saved.perTable["table-t"].columns = ["plate", "total"]; // "name" off
    const now = prepareTableSection("table-t", {
      kind: "table", id: "t", title: "Auto's", header: ["Kenteken", "Omschrijving", "Totaal", "Nieuw"], columnIds: ["plate", "name", "total", "extra"],
      allRows: () => ({ rows: [], truncated: false }),
    }, { rows: eleven.map((r) => [...r, "x"]), truncated: false, rowKeys: eleven.map((_, i) => `v${i}`) });
    const merged = mergePrintOptions(defaultPrintOptions([now]), saved, [now]);
    expect(merged.perTable["table-t"].columns).toEqual(["plate", "total", "extra"]);
  });

  it("falls back to all columns when the earlier choice leaves none", () => {
    const sections = [table()];
    const saved = defaultPrintOptions(sections);
    saved.perTable["table-t"].columns = ["gone"];
    const merged = mergePrintOptions(defaultPrintOptions(sections), saved, sections);
    expect(merged.perTable["table-t"].columns).toEqual(["plate", "name", "total"]);
  });

  it("puts the totals label in the first visible column when the first column is hidden", () => {
    const html = doc([table()], (o) => { o.perTable["table-t"].columns = ["name", "total"]; });
    expect(html).toMatch(/<tfoot><tr><td>Totaal<\/td><td>€\s66,00<\/td><\/tr><\/tfoot>/);
    const picked = doc([table()], (o) => { o.perTable["table-t"] = { ...o.perTable["table-t"], columns: ["name", "total"], rows: "pick", picked: ["v2", "v5"] }; });
    expect(picked).toContain("<td>Totaal (gekozen regels)</td>");
  });
});
