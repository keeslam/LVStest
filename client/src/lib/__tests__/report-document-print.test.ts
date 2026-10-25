/**
 * Rapporten herontwerp deel 1, Task 4 - the one print document of a report.
 */
import { describe, it, expect } from "vitest";
import { reportDocumentHtml } from "../report-document-print";

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
