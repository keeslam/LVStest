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
    expect(srcDoc()).not.toContain("<table");
    await user.click(screen.getByTestId("print-option-landscape"));
    expect(srcDoc()).toContain("size: A4 landscape");
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
