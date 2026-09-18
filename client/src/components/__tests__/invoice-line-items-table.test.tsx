import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { InboxLineItem } from "@shared/invoice-inbox";
import { InvoiceLineItemsTable } from "@/components/expenses/invoice-line-items-table";

const LINES: InboxLineItem[] = [
  { description: "Grote beurt", amount: 80, category: "Maintenance" },
  { description: "Remblokken", amount: 50, category: "Brakes" },
  { description: "Ruitenwissers", amount: 20, category: "Accessories" },
];

function Harness({ initialSelected }: { initialSelected: number[] }) {
  const [items, setItems] = useState(LINES);
  const [selected, setSelected] = useState(new Set(initialSelected));
  return (
    <>
      <InvoiceLineItemsTable items={items} selected={selected} onItemsChange={setItems} onSelectedChange={setSelected} />
      <output data-testid="state">{JSON.stringify({ items, selected: Array.from(selected).sort() })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("InvoiceLineItemsTable", () => {
  it("shows every line with the Dutch category label and the selection count", () => {
    render(<Harness initialSelected={[0, 1, 2]} />);
    expect(screen.getByTestId("input-description-1")).toHaveValue("Remblokken");
    expect(screen.getByTestId("input-amount-1")).toHaveValue(50);
    expect(screen.getByTestId("select-category-1")).toHaveTextContent("Remmen");
    expect(screen.getByText("Alles selecteren (3/3)")).toBeInTheDocument();
  });

  it("edits a description and an amount in place", async () => {
    render(<Harness initialSelected={[0]} />);
    await userEvent.type(screen.getByTestId("input-description-0"), " APK");
    fireEvent.change(screen.getByTestId("input-amount-0"), { target: { value: "95.5" } });
    expect(state().items[0]).toMatchObject({ description: "Grote beurt APK", amount: 95.5 });
  });

  it("removing a line keeps the selection on the lines it was on", async () => {
    render(<Harness initialSelected={[0, 2]} />);
    await userEvent.click(screen.getByTestId("button-remove-1"));
    expect(state().items.map((i: InboxLineItem) => i.description)).toEqual(["Grote beurt", "Ruitenwissers"]);
    expect(state().selected).toEqual([0, 1]);
  });

  /** M9: the remove button is an icon only, so a screen reader read "button". */
  it("names the icon-only remove button", () => {
    render(<Harness initialSelected={[]} />);
    expect(screen.getByTestId("button-remove-1")).toHaveAccessibleName("Regel verwijderen");
  });

  it("toggles one line and all lines", async () => {
    render(<Harness initialSelected={[]} />);
    await userEvent.click(screen.getByTestId("checkbox-item-2"));
    expect(state().selected).toEqual([2]);
    await userEvent.click(screen.getByTestId("checkbox-select-all"));
    expect(state().selected).toEqual([0, 1, 2]);
    await userEvent.click(screen.getByTestId("checkbox-select-all"));
    expect(state().selected).toEqual([]);
  });
});
