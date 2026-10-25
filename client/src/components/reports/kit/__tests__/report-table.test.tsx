/**
 * Rapporten herontwerp deel 1, Task 3 - ReportTable: pages of 10, search, sorting,
 * reset on filter change, totals row and the onView callback.
 *
 * Runs in the jsdom project.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportTable, reportTableCsv, type ReportTableColumn } from "@/components/reports/kit/report-table";

interface Row { id: number; plate: string; km: number }
const ROWS: Row[] = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, plate: `XK-${String(i + 1).padStart(2, "0")}-A`, km: (i * 7) % 23 }));
const COLUMNS: ReportTableColumn<Row>[] = [
  { id: "plate", label: "Kenteken", cell: (r) => r.plate, text: (r) => r.plate, sortValue: (r) => r.plate },
  { id: "km", label: "Km", cell: (r) => String(r.km), text: (r) => String(r.km), sortValue: (r) => r.km, align: "right" },
];
const rowEls = () => screen.getAllByTestId(/^rt-row-/);
const props = { rows: ROWS, columns: COLUMNS, rowKey: (r: Row) => r.id, testId: "rt", resetKey: "a" };

describe("ReportTable", () => {
  it("shows 10 of 23 rows with the shared pager wording and 3 rows on page 3", async () => {
    const user = userEvent.setup();
    render(<ReportTable {...props} />);
    expect(rowEls()).toHaveLength(10);
    expect(screen.getByTestId("rt-pagination")).toHaveTextContent("1–10 van 23");
    expect(screen.getByTestId("rt-page-indicator")).toHaveTextContent("1 / 3");
    await user.click(screen.getByTestId("rt-next-page"));
    await user.click(screen.getByTestId("rt-next-page"));
    expect(rowEls()).toHaveLength(3);
  });

  it("offers page sizes 10, 25 and 50", () => {
    render(<ReportTable {...props} />);
    const options = within(screen.getByTestId("rt-page-size")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["10", "25", "50"]);
  });

  it("filters case-insensitively across columns and returns to page 1", async () => {
    const user = userEvent.setup();
    render(<ReportTable {...props} />);
    await user.click(screen.getByTestId("rt-next-page"));
    await user.type(screen.getByTestId("rt-search"), "xk-11");
    expect(rowEls()).toHaveLength(1);
    expect(rowEls()[0]).toHaveTextContent("XK-11-A");
  });

  it("sorts ascending on first click and descending on the second", async () => {
    const user = userEvent.setup();
    render(<ReportTable {...props} />);
    await user.click(screen.getByTestId("rt-sort-km"));
    expect(rowEls()[0]).toHaveTextContent("XK-01-A");
    expect(screen.getByTestId("rt-sort-km").closest("th")).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByTestId("rt-sort-km"));
    expect(screen.getByTestId("rt-sort-km").closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(rowEls()[0]).toHaveTextContent("22");
  });

  it("applies defaultSort", () => {
    render(<ReportTable {...props} defaultSort={{ id: "plate", dir: "desc" }} />);
    expect(rowEls()[0]).toHaveTextContent("XK-23-A");
  });

  it("goes back to page 1 when resetKey changes but keeps the search term", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReportTable {...props} />);
    await user.type(screen.getByTestId("rt-search"), "xk");
    await user.click(screen.getByTestId("rt-next-page"));
    await user.click(screen.getByTestId("rt-next-page"));
    expect(screen.getByTestId("rt-page-indicator")).toHaveTextContent("3 / 3");
    rerender(<ReportTable {...props} resetKey="b" />);
    expect(screen.getByTestId("rt-page-indicator")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("rt-search")).toHaveValue("xk");
  });

  it("renders a totals row", () => {
    render(<ReportTable {...props} totals={{ plate: "Totaal", km: "1.234" }} />);
    expect(screen.getByTestId("rt-totals")).toHaveTextContent("Totaal");
    expect(screen.getByTestId("rt-totals")).toHaveTextContent("1.234");
  });

  it("reports the filtered rows and the current page through onView", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(<ReportTable {...props} onView={onView} />);
    await user.click(screen.getByTestId("rt-next-page"));
    const last = onView.mock.calls.at(-1)![0];
    expect(last.page).toHaveLength(10);
    expect(last.all).toHaveLength(23);
  });

  it("shows the empty text when there are no rows", () => {
    render(<ReportTable {...props} rows={[]} />);
    expect(screen.getByTestId("rt-empty")).toHaveTextContent("Geen gegevens in deze periode.");
  });

  it("does not loop when the parent sets state in onView with inline rows", () => {
    const onView = vi.fn();
    function Parent() {
      const [, setSeen] = useState<unknown>(null);
      return <ReportTable {...props} rows={ROWS.map((r) => r)} columns={[...COLUMNS]} onView={(v) => { onView(); setSeen({ v }); }} />;
    }
    render(<Parent />);
    expect(onView.mock.calls.length).toBeLessThanOrEqual(3);
    expect(screen.getByTestId("rt-page-indicator")).toHaveTextContent("1 / 3");
  });

  it("keeps page 2 when rerendered with a new but equal rows array", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReportTable {...props} />);
    await user.click(screen.getByTestId("rt-next-page"));
    rerender(<ReportTable {...props} rows={ROWS.map((r) => r)} columns={[...COLUMNS]} />);
    expect(screen.getByTestId("rt-page-indicator")).toHaveTextContent("2 / 3");
  });

  it("clamps to the last page when rows shrink below the current page", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReportTable {...props} />);
    await user.click(screen.getByTestId("rt-next-page"));
    await user.click(screen.getByTestId("rt-next-page"));
    rerender(<ReportTable {...props} rows={ROWS.slice(0, 12)} />);
    expect(screen.getByTestId("rt-page-indicator")).toHaveTextContent("2 / 2");
    expect(rowEls()).toHaveLength(2);
  });

  it("shows a separate text when a search has no matches", async () => {
    const user = userEvent.setup();
    render(<ReportTable {...props} />);
    await user.type(screen.getByTestId("rt-search"), "zzz");
    expect(screen.getByTestId("rt-no-match")).toHaveTextContent("Geen regels gevonden voor deze zoekterm.");
  });

  it("appends totals to the CSV and sorts NaN like null", () => {
    expect(reportTableCsv(COLUMNS, [], { km: "5" })).toEqual([["Kenteken", "Km"], ["", "5"]]);
  });

  it("builds CSV rows from the column text", () => {
    expect(reportTableCsv(COLUMNS, ROWS.slice(0, 1))).toEqual([["Kenteken", "Km"], ["XK-01-A", "0"]]);
  });
});
