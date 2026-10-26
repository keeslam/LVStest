/**
 * Rapporten herontwerp deel 1, Task 4 - the print dialog: options, exact preview, print.
 *
 * Runs in the jsdom project.
 */
import { useEffect, useState, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportFiltersProvider } from "@/pages/reports/report-filters";
import { ReportPrintDialog, ReportPrintProvider, useReportPrint, useReportPrintAvailable } from "../report-print";
import { chartSvgFromRef, type PrintSection } from "@/lib/report-document-print";
import { ReportMonthChart } from "../report-month-chart";
import { ReportTopChart } from "../report-top-chart";
import { useRef } from "react";

vi.mock("@/lib/audit-events", async (importOriginal) => ({ ...(await importOriginal<object>()), reportClientAction: vi.fn() }));

const TABLE: PrintSection = {
  kind: "table",
  id: "t",
  header: ["Kenteken"],
  allRows: () => ({ rows: [["ALL-1"], ["ALL-2"], ["PAGE-1"]], truncated: false }),
  pageRows: [["PAGE-1"]],
};

function Report({ sections }: { sections: PrintSection[] | null }) {
  useReportPrint(sections);
  return null;
}

function Opener({ title = "Rapport" }: { title?: string }) {
  const [open, setOpen] = useState(true);
  const available = useReportPrintAvailable();
  return <>{available && <span data-testid="available" />}<ReportPrintDialog open={open} onOpenChange={setOpen} title={title} /></>;
}

function wrap(ui: ReactNode, initial = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["/api/app-settings/key/company_name"], { value: "Firma Test" });
  client.setQueryData(["/api/vehicles"], [{ id: 7, licensePlate: "XK-01-A" }]);
  return render(
    <QueryClientProvider client={client}>
      <ReportFiltersProvider initial={{ from: "2026-10-01", to: "2026-10-31", preset: "custom", ...initial }}>
        <ReportPrintProvider>{ui}</ReportPrintProvider>
      </ReportFiltersProvider>
    </QueryClientProvider>,
  );
}

const srcDoc = () => (screen.getByTestId("print-preview-frame") as HTMLIFrameElement).getAttribute("srcdoc") ?? "";

describe("ReportPrintDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers only the section kinds the report has and shows the period, company and filters", async () => {
    wrap(<><Report sections={[TABLE]} /><Opener title="Bekeuringen" /></>, { vehicleId: "7", category: "Personenauto" });
    await waitFor(() => expect(screen.getByTestId("print-preview-frame")).toBeInTheDocument());
    expect(screen.queryByTestId("print-option-tiles")).not.toBeInTheDocument();
    expect(screen.queryByTestId("print-option-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("print-option-table")).toBeChecked();
    expect(screen.getByTestId("print-option-landscape")).not.toBeChecked();
    await waitFor(() => expect(srcDoc()).toContain("ALL-2"));
    const html = srcDoc();
    expect(html).toContain("Firma Test");
    expect(html).toContain("1-10-2026 t/m 31-10-2026");
    expect(html).toContain("XK-01-A");
    expect(html).toContain("Personenauto");
    expect(html).toContain("size: A4 portrait");
  });

  it("leaves out the vehicle and category lines when nothing is chosen", async () => {
    wrap(<><Report sections={[TABLE]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain("ALL-1"));
    expect(srcDoc()).not.toContain("Auto:");
    expect(srcDoc()).not.toContain("Categorie:");
  });

  it("prints only the page rows when asked, and no table when the box is off", async () => {
    const user = userEvent.setup();
    wrap(<><Report sections={[TABLE]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain("ALL-1"));
    expect(screen.queryByRole("option", { name: "Alleen aangevinkte" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("print-option-rows"), "page");
    await waitFor(() => expect(srcDoc()).not.toContain("ALL-1"));
    expect(srcDoc()).toContain("PAGE-1");
    await user.click(screen.getByTestId("print-option-table"));
    await waitFor(() => expect(srcDoc()).not.toContain("<table"));
    await user.click(screen.getByTestId("print-option-landscape"));
    await waitFor(() => expect(srcDoc()).toContain("size: A4 landscape"));
  });

  it("waits for rows that are fetched and shows a loading state meanwhile", async () => {
    let resolve!: (v: { rows: string[][]; truncated: boolean }) => void;
    const slow: PrintSection = { ...TABLE, kind: "table", id: "s", header: ["K"], allRows: () => new Promise((r) => { resolve = r; }) } as PrintSection;
    wrap(<><Report sections={[slow]} /><Opener /></>);
    expect(await screen.findByTestId("print-loading")).toBeInTheDocument();
    resolve({ rows: [["LATE-1"]], truncated: true });
    await waitFor(() => expect(srcDoc()).toContain("LATE-1"));
    expect(srcDoc()).toContain("Niet alle regels passen in de export");
    expect(screen.queryByTestId("print-loading")).not.toBeInTheDocument();
  });

  it("calls print on the preview frame and logs the print", async () => {
    const user = userEvent.setup();
    const { reportClientAction } = await import("@/lib/audit-events");
    wrap(<><Report sections={[TABLE]} /><Opener title="Bekeuringen" /></>);
    await waitFor(() => expect(srcDoc()).toContain("ALL-1"));
    const frame = screen.getByTestId("print-preview-frame") as HTMLIFrameElement;
    const print = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { focus: vi.fn(), print }, configurable: true });
    await user.click(screen.getByTestId("button-print-confirm"));
    expect(print).toHaveBeenCalledTimes(1);
    expect(reportClientAction).toHaveBeenCalledWith("report.print", { details: { report: "Bekeuringen" } });
  });

  it("makes a chart from its svg", async () => {
    wrap(<><Report sections={[{ kind: "chart", getSvg: () => "<svg id=\"chart-1\"></svg>" }]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain("<svg id=\"chart-1\"></svg>"));
    expect(screen.getByTestId("print-option-chart")).toBeChecked();
  });
});

describe("ReportPrintDialog choices (Task 7)", () => {
  const plates = Array.from({ length: 11 }, (_, i) => `AB-${String(i).padStart(2, "0")}-CD`);
  const BIG: PrintSection = {
    kind: "table",
    id: "cars",
    title: "Auto's",
    header: ["Kenteken", "Merk", "Totaal"],
    columnIds: ["plate", "brand", "total"],
    allRows: () => ({ rows: plates.map((p, i) => [p, `Merk ${i}`, `€ ${i + 1},00`]), truncated: false, rowKeys: plates }),
    selectedRows: [[plates[4], "Merk 4", "€ 5,00"]],
    selectedRowKeys: [plates[4]],
    totals: ["Totaal", "", "€ 66,00"],
  };
  const TILES: PrintSection = { kind: "tiles", tiles: [{ label: "Kosten", value: "€ 66,00" }] };
  const tbody = () => srcDoc().slice(srcDoc().indexOf("<tbody>"), srcDoc().indexOf("</tbody>"));

  it("prints exactly the 2 rows picked of 11, with the total over those 2", async () => {
    const user = userEvent.setup();
    wrap(<><Report sections={[BIG]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    await user.click(screen.getByTestId("print-more-table-cars"));
    await user.selectOptions(screen.getByTestId("print-rows-table-cars"), "pick");
    // the row ticked on screen is already on
    expect(screen.getByTestId(`print-pick-table-cars-${plates[4]}`)).toBeChecked();
    expect(screen.getByTestId("print-pick-count-table-cars")).toHaveTextContent("1 van 11 gekozen");
    await user.click(screen.getByTestId("print-pick-none-table-cars"));
    expect(screen.getByTestId("print-pick-count-table-cars")).toHaveTextContent("0 van 11 gekozen");
    await user.click(screen.getByTestId(`print-pick-table-cars-${plates[2]}`));
    await user.click(screen.getByTestId(`print-pick-table-cars-${plates[7]}`));
    await waitFor(() => expect(tbody().match(/<tr>/g)).toHaveLength(2));
    expect(tbody()).toContain(plates[2]);
    expect(tbody()).toContain(plates[7]);
    expect(srcDoc()).toMatch(/<td>Totaal \(gekozen regels\)<\/td><td><\/td><td>€\s11,00<\/td>/);
    await user.click(screen.getByTestId("print-pick-all-table-cars"));
    expect(screen.getByTestId("print-pick-count-table-cars")).toHaveTextContent("11 van 11 gekozen");
  });

  it("finds a plate in the pick list without dashes", async () => {
    const user = userEvent.setup();
    wrap(<><Report sections={[BIG]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    await user.click(screen.getByTestId("print-more-table-cars"));
    await user.selectOptions(screen.getByTestId("print-rows-table-cars"), "pick");
    await user.type(screen.getByTestId("print-pick-search-table-cars"), "ab03cd");
    expect(screen.getByTestId(`print-pick-table-cars-${plates[3]}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`print-pick-table-cars-${plates[4]}`)).not.toBeInTheDocument();
  });

  it("leaves out a column, sorts descending and moves a section, and keeps the choices when opened again", async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [open, setOpen] = useState(true);
      return <><button data-testid="toggle" onClick={() => setOpen((o) => !o)} /><ReportPrintDialog open={open} onOpenChange={setOpen} title="R" /></>;
    }
    wrap(<><Report sections={[TILES, BIG]} /><Toggle /></>);
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    expect(srcDoc().indexOf('class="tiles"')).toBeLessThan(srcDoc().indexOf("<table"));
    await user.click(screen.getByTestId("print-more-table-cars"));
    await user.click(screen.getByTestId("print-column-table-cars-brand"));
    await waitFor(() => expect(srcDoc()).not.toContain("Merk 3"));
    await user.selectOptions(screen.getByTestId("print-sort-table-cars"), "total");
    await user.selectOptions(screen.getByTestId("print-sort-dir-table-cars"), "desc");
    await waitFor(() => expect(tbody().indexOf(plates[10])).toBeLessThan(tbody().indexOf(plates[1])));
    await user.click(screen.getByTestId("print-move-up-table-cars"));
    await waitFor(() => expect(srcDoc().indexOf("<table")).toBeLessThan(srcDoc().indexOf('class="tiles"')));
    await user.click(screen.getByTestId("print-option-pagebreak"));
    await waitFor(() => expect(srcDoc()).toContain("page-break-before"));

    // close and open again: the same choices
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("print-preview-frame")).not.toBeInTheDocument());
    await user.click(screen.getByTestId("toggle"));
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    expect(srcDoc()).not.toContain("Merk 3");
    expect(srcDoc().indexOf("<table")).toBeLessThan(srcDoc().indexOf('class="tiles"'));
    expect(srcDoc()).toContain("page-break-before");
  });

  it("opens the choices of a table by itself when Zelf kiezen is chosen in the top select", async () => {
    const user = userEvent.setup();
    wrap(<><Report sections={[BIG]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    expect(screen.queryByTestId("print-pick-count-table-cars")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("print-option-rows"), "pick");
    expect(await screen.findByTestId("print-pick-count-table-cars")).toHaveTextContent("1 van 11 gekozen");
  });

  it("rebuilds the preview only after a short pause, not on every click", async () => {
    const user = userEvent.setup();
    wrap(<><Report sections={[BIG]} /><Opener /></>);
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    expect(srcDoc()).toContain("size: A4 portrait");
    await user.click(screen.getByTestId("print-option-landscape"));
    expect(srcDoc()).toContain("size: A4 portrait"); // still the old one right after the click
    await waitFor(() => expect(srcDoc()).toContain("size: A4 landscape"));
  });

  it("keeps the choices in a provider that is given its own memory, also for a new provider", async () => {
    const user = userEvent.setup();
    const memory = new Map();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (
      <QueryClientProvider client={client}>
        <ReportFiltersProvider initial={{ from: "2026-10-01", to: "2026-10-31", preset: "custom" }}>
          <ReportPrintProvider remembered={memory}><Report sections={[BIG]} /><Opener /></ReportPrintProvider>
        </ReportFiltersProvider>
      </QueryClientProvider>
    );
    const first = render(tree);
    await waitFor(() => expect(srcDoc()).toContain(plates[10]));
    await user.click(screen.getByTestId("print-option-landscape"));
    await waitFor(() => expect(srcDoc()).toContain("size: A4 landscape"));
    first.unmount();
    render(tree);
    await waitFor(() => expect(screen.getByTestId("print-option-landscape")).toBeChecked());
  });

  it("prints an own title, a note and the font size, and hides the filter lines on request", async () => {
    const user = userEvent.setup();
    wrap(<><Report sections={[BIG]} /><Opener title="Kosten" /></>, { category: "Personenauto" });
    await waitFor(() => expect(srcDoc()).toContain("Personenauto"));
    await user.click(screen.getByTestId("print-layout-toggle"));
    await user.type(screen.getByTestId("print-option-title"), "Mijn <lijst>");
    await user.type(screen.getByTestId("print-option-note"), "Voor Kees");
    await user.selectOptions(screen.getByTestId("print-option-fontsize"), "small");
    await user.click(screen.getByTestId("print-option-filters"));
    await waitFor(() => expect(srcDoc()).toContain("Mijn &lt;lijst&gt;"));
    expect(srcDoc()).toContain("Voor Kees");
    expect(srcDoc()).toContain('<body class="font-small">');
    expect(srcDoc()).not.toContain("Personenauto");
  });
});

describe("useReportPrint", () => {
  it("does not loop when a report passes a fresh array on every render", () => {
    let renders = 0;
    function Fresh() {
      renders += 1;
      useReportPrint([{ kind: "note", text: "x" }]);
      return null;
    }
    wrap(<><Fresh /><Opener /></>);
    expect(screen.getByTestId("available")).toBeInTheDocument();
    expect(renders).toBeLessThan(5);
  });

  it("is not available for null sections", () => {
    wrap(<><Report sections={null} /><Opener /></>);
    expect(screen.queryByTestId("available")).not.toBeInTheDocument();
  });
});

describe("chart svg capture", () => {
  it("reads the svg of the month chart and the top chart through their wrapper ref", () => {
    const seen: Array<string | null> = [];
    function Both() {
      const a = useRef<HTMLDivElement>(null);
      const b = useRef<HTMLDivElement>(null);
      useEffect(() => { seen.push(chartSvgFromRef(a.current ? { current: a.current } : { current: null }), chartSvgFromRef(b)); });
      return (<><ReportMonthChart data={[{ month: "2026-10", n: 3 }]} series={[{ key: "n", label: "N", color: "#000" }]} testId="mc" chartRef={a} /><ReportTopChart rows={[{ key: "a", label: "A", amount: 5, count: 1 }]} nullLabel="-" color="#000" testId="tc" chartRef={b} /></>);
    }
    render(<Both />);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toContain("<svg");
    expect(seen[seen.length - 2]).toContain("recharts-surface");
  });
});
