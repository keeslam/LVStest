/**
 * Final wave A, item 7 (A-12-15 properly; P4 minor 3): the SearchableCombobox is operable by keyboard and
 * announced by a screen reader. The list is a role="listbox" of role="option" rows (aria-selected, a
 * name per row), the search box is the combobox that points at the active row, ArrowUp/ArrowDown move
 * it, Enter chooses it and Escape closes the list. Mouse use is unchanged.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox";

const OPTIONS: ComboboxOption[] = [
  { value: "1", label: "AB-123-C", description: "Volkswagen Crafter", group: "Bestelwagens", tags: ["Beschikbaar"] },
  { value: "2", label: "XY-987-Z", description: "Ford Transit", group: "Bestelwagens" },
  { value: "3", label: "PQ-555-R", group: "Personenwagens" },
];

function Harness({ onChange = () => {}, initial = "", groups = false, recentValues }: { onChange?: (v: string) => void; initial?: string; groups?: boolean; recentValues?: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <SearchableCombobox
      options={OPTIONS}
      value={value}
      onChange={(v) => { setValue(v); onChange(v); }}
      placeholder="Kies voertuig"
      searchPlaceholder="Zoek voertuig"
      groups={groups}
      recentValues={recentValues}
      data-testid="vehicle-combobox"
    />
  );
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("vehicle-combobox"));
  return screen.findByRole("listbox");
}

describe("SearchableCombobox, structure", () => {
  it("renders a listbox of options, each with a name, and marks the chosen one", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2" />);
    const listbox = await openList(user);
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(within(listbox).getByRole("option", { name: /AB-123-C/ })).toHaveAttribute("aria-selected", "false");
    expect(within(listbox).getByRole("option", { name: /XY-987-Z/ })).toHaveAttribute("aria-selected", "true");
    // The name carries what the row says, the description included, but not the decorative badge twice.
    expect(within(listbox).getByRole("option", { name: "AB-123-C, Volkswagen Crafter" })).toBeInTheDocument();
  });

  it("names the search box as the combobox that controls the listbox", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = await openList(user);
    const search = screen.getByRole("combobox", { name: "Zoek voertuig" });
    expect(search).toHaveAttribute("aria-expanded", "true");
    expect(search).toHaveAttribute("aria-controls", listbox.id);
  });

  it("keeps groups as role=group inside the listbox and does not repeat ids for a recent row", async () => {
    const user = userEvent.setup();
    render(<Harness groups recentValues={["1"]} />);
    const listbox = await openList(user);
    expect(within(listbox).getAllByRole("group").length).toBeGreaterThan(1);
    const ids = within(listbox).getAllByRole("option").map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("SearchableCombobox, keyboard", () => {
  it("ArrowDown and ArrowUp move the active row, Enter chooses it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await openList(user);
    const search = screen.getByRole("combobox", { name: "Zoek voertuig" });
    const active = () => document.getElementById(search.getAttribute("aria-activedescendant") ?? "")?.textContent ?? "";

    expect(active()).toContain("AB-123-C");
    await user.keyboard("{ArrowDown}");
    expect(active()).toContain("XY-987-Z");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toContain("PQ-555-R"); // stays on the last row
    await user.keyboard("{ArrowUp}");
    expect(active()).toContain("XY-987-Z");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByTestId("vehicle-combobox")).toHaveTextContent("XY-987-Z");
  });

  it("starts on the chosen row when one is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness initial="3" />);
    await openList(user);
    const search = screen.getByRole("combobox", { name: "Zoek voertuig" });
    expect(document.getElementById(search.getAttribute("aria-activedescendant") ?? "")).toHaveTextContent("PQ-555-R");
  });

  it("Escape closes the list without choosing and gives the focus back to the trigger", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await openList(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("vehicle-combobox")).toHaveFocus();
  });

  it("typing filters the rows and the active row follows the first match; Enter with no match does nothing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await openList(user);
    const search = screen.getByRole("combobox", { name: "Zoek voertuig" });
    await user.type(search, "transit");
    // The filter runs after the box's own typing pause.
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(document.getElementById(search.getAttribute("aria-activedescendant") ?? "")).toHaveTextContent("XY-987-Z");

    await user.clear(search);
    await user.type(search, "zzzz");
    expect(await screen.findByText("No options found.")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SearchableCombobox, Enter while the search is still settling", () => {
  it("does not choose a row of the old list: the filter is applied first, then Enter picks the filtered row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await openList(user);
    const search = screen.getByRole("combobox", { name: "Zoek voertuig" });
    // Typed and confirmed at once, inside the box's own typing pause: the list still shows all three rows.
    await user.type(search, "transit{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2");
  });
});

describe("SearchableCombobox, mouse", () => {
  it("still chooses a row by clicking it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const listbox = await openList(user);
    await user.click(within(listbox).getByRole("option", { name: "PQ-555-R" }));
    expect(onChange).toHaveBeenCalledWith("3");
  });
});
