/**
 * Report builder, calculated fields (rapporten herontwerp deel 4, Task 3): a formula bar with chips,
 * if-then rules, calculated fields as column / filter / group, the result shown by its kind and the
 * server's REPORT_CALC_INVALID named by the field's own name.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRole } from "@shared/schema";
import i18n from "@/i18n";
import { getQueryFn } from "@/lib/queryClient";

let role: string = UserRole.ADMIN;
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "tester", role, permissions: [], hidePrices: false }, isLoading: false }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...a: any[]) => toast(...a) }));

import ReportBuilder from "@/pages/reports/report-builder";
import { calcDisplayNumber, csvCell, csvHeader, displayCell, withCalcInfo } from "@/pages/reports/report-builder-output";
import { builderChartData } from "@/pages/reports/report-builder-chart";
import { parseDutchNumber } from "@/pages/reports/calculated-field-dialog";

let executeBody: any = null;
let executeError: unknown = null;
let saveBody: any = null;
function installFetch(rows: any[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    if (path === "/api/reports/saved" && init?.method === "POST") {
      saveBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (path === "/api/reports/execute") {
      executeBody = JSON.parse(init.body);
      if (executeError) return new Response(JSON.stringify(executeError), { status: 400, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}
function renderBuilder() {
  const client = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>);
}

beforeEach(() => { toast.mockClear(); executeError = null; executeBody = null; saveBody = null; role = UserRole.ADMIN; });
afterEach(async () => { vi.unstubAllGlobals(); await i18n.changeLanguage("nl"); });

type User = ReturnType<typeof userEvent.setup>;

async function pickExpenses(user: User) {
  await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
  await user.click(screen.getByTestId("checkbox-datasource-expenses"));
}

async function typeNumber(user: User, text: string) {
  await user.clear(screen.getByTestId("input-formula-number"));
  await user.type(screen.getByTestId("input-formula-number"), text);
  await user.click(screen.getByTestId("button-formula-add-number"));
}

/** Makes "Incl. btw" = Bedrag × 1,21 and returns its id. */
async function makeInclVat(user: User, type?: string): Promise<string> {
  await user.click(screen.getByTestId("button-add-calculated-field"));
  const dialog = await screen.findByTestId("dialog-calculated-field");
  await user.type(within(dialog).getByTestId("input-calc-name"), "Incl. btw");
  await user.click(within(dialog).getByTestId("button-formula-field-expenses.amount"));
  await user.click(within(dialog).getByTestId("button-formula-times"));
  await typeNumber(user, "1,21");
  if (type) {
    await user.click(within(dialog).getByTestId("select-calc-type"));
    await user.click(await screen.findByRole("option", { name: type }));
  }
  await user.click(within(dialog).getByTestId("button-save-calculated-field"));
  await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());
  const add = screen.getAllByTestId(/^button-add-calc-/).at(-1)!;
  return add.getAttribute("data-testid")!.replace("button-add-calc-", "");
}

describe("calculated field dialog", () => {
  it("shows the formula as chips with labels and a comma decimal", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    await user.click(screen.getByTestId("button-formula-field-expenses.amount"));
    await user.click(screen.getByTestId("button-formula-times"));
    await typeNumber(user, "1,21");
    expect(screen.getByTestId("formula-bar")).toHaveTextContent("Bedrag × 1,21");
    await user.click(screen.getByTestId("button-formula-backspace"));
    expect(screen.getByTestId("formula-bar")).toHaveTextContent("Bedrag ×");
  });

  it("says a field or number is missing for [Bedrag, +]", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    await user.click(screen.getByTestId("button-formula-field-expenses.amount"));
    await user.click(screen.getByTestId("button-formula-plus"));
    expect(screen.getByTestId("formula-error")).toHaveTextContent("Er mist een veld of getal.");
    expect(screen.getByTestId("button-save-calculated-field")).toBeDisabled();
  });

  it("offers only number fields for a sum", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    expect(screen.getByTestId("button-formula-field-expenses.amount")).toBeInTheDocument();
    expect(screen.queryByTestId("button-formula-field-expenses.category")).toBeNull();
    expect(screen.getByTestId("button-formula-field-vehicle:vehicles.dailyPrice")).toBeInTheDocument();
  });

  it("previews with the first row of the last result, or asks to run first", async () => {
    installFetch([{ amount: "100.00" }]);
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    await user.click(screen.getByTestId("button-formula-field-expenses.amount"));
    expect(screen.getByTestId("calc-preview")).toHaveTextContent("Voer het rapport uit voor een voorbeeld.");
    await user.click(screen.getByTestId("button-cancel-calculated-field"));
    await user.click(screen.getByTestId("button-add-field-amount"));
    await user.click(screen.getByTestId("button-run-report"));
    await screen.findByTestId("dialog-report-results");
    await user.click(screen.getByTestId("button-close-results"));
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    await user.click(screen.getByTestId("button-formula-field-expenses.amount"));
    await user.click(screen.getByTestId("button-formula-times"));
    await typeNumber(user, "1,21");
    expect(screen.getByTestId("calc-preview")).toHaveTextContent("121");
  });
});

describe("calculated fields in the report", () => {
  it("sends the formula and the column { calc: id } on run and on save", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user);
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.calculatedFields[0]).toMatchObject({ id, name: "Incl. btw", kind: "formula" });
    expect(executeBody.calculatedFields[0].formula).toEqual({
      kind: "op", op: "*", left: { kind: "field", table: "expenses", field: "amount" }, right: { kind: "number", value: 1.21 },
    });
    expect(executeBody.columns[0]).toMatchObject({ calc: id, table: "", field: "" });

    await user.click(screen.getByTestId("button-close-results"));
    await user.click(screen.getByTestId("button-save-report"));
    await user.type(await screen.findByTestId("input-report-name"), "Kosten incl. btw");
    await user.click(screen.getByTestId("button-confirm-save"));
    await waitFor(() => expect(saveBody).not.toBeNull());
    expect(saveBody.calculatedFields).toEqual(executeBody.calculatedFields);
    expect(saveBody.columns[0]).toMatchObject({ calc: id });
  });

  it("sends no calculatedFields when the report has none", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-field-amount"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect("calculatedFields" in executeBody).toBe(false);
  });

  it("opens an existing field with its formula to change it", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user);
    await user.click(screen.getByTestId(`button-edit-calc-${id}`));
    const dialog = await screen.findByTestId("dialog-calculated-field");
    expect(within(dialog).getByTestId("input-calc-name")).toHaveValue("Incl. btw");
    expect(within(dialog).getByTestId("formula-bar")).toHaveTextContent("Bedrag × 1,21");
    await user.click(within(dialog).getByTestId("button-formula-backspace"));
    await typeNumber(user, "1,09");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.calculatedFields).toHaveLength(1);
    expect(executeBody.calculatedFields[0].formula.right).toEqual({ kind: "number", value: 1.09 });
  });

  it("filters and groups on a calculated field", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user);
    await user.click(screen.getByTestId("select-report-group-by"));
    await user.click(await screen.findByRole("option", { name: "Incl. btw" }));
    await user.click(screen.getByTestId("button-add-filter"));
    await user.click(screen.getByTestId("select-filter-field"));
    await user.click(await screen.findByRole("option", { name: "Incl. btw" }));
    await user.click(screen.getByTestId("select-filter-operator"));
    const ops = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(ops).toContain("is groter dan");
    expect(ops).not.toContain("bevat");
    await user.click(await screen.findByRole("option", { name: "is groter dan" }));
    await user.type(screen.getByTestId("input-filter-value"), "100");
    await user.click(screen.getByTestId("button-confirm-filter"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.groupBy).toEqual([{ table: "", field: "", calc: id }]);
    expect(executeBody.columns[0]).toMatchObject({ calc: id });
    expect(executeBody.filters[0]).toMatchObject({ calc: id, operator: "greater_than", value: "100" });
  });

  it("sends an if-then rule with texts Hoog / Normaal", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    const dialog = await screen.findByTestId("dialog-calculated-field");
    await user.type(within(dialog).getByTestId("input-calc-name"), "Klasse");
    await user.click(within(dialog).getByTestId("button-calc-kind-ifThen"));
    await user.click(within(dialog).getByTestId("select-calc-when-field"));
    await user.click(await screen.findByRole("option", { name: "Bedrag" }));
    await user.click(within(dialog).getByTestId("select-calc-when-test"));
    await user.click(await screen.findByRole("option", { name: "groter dan" }));
    await user.type(within(dialog).getByTestId("input-calc-when-value"), "500");
    await user.type(within(dialog).getByTestId("input-calc-then-text"), "Hoog");
    await user.type(within(dialog).getByTestId("input-calc-otherwise-text"), "Normaal");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());
    await user.click(screen.getAllByTestId(/^button-add-calc-/)[0]);
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.calculatedFields[0]).toMatchObject({ kind: "ifThen", type: "text" });
    expect(executeBody.calculatedFields[0].rule).toEqual({
      when: { ref: { kind: "field", table: "expenses", field: "amount" }, test: "gt", value: 500 },
      then: { text: "Hoog" },
      otherwise: { text: "Normaal" },
    });
  });

  it("refuses to delete a field another one uses, with a message", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const first = await makeInclVat(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    const dialog = await screen.findByTestId("dialog-calculated-field");
    await user.type(within(dialog).getByTestId("input-calc-name"), "Dubbel");
    await user.click(within(dialog).getByTestId(`button-formula-calc-${first}`));
    await user.click(within(dialog).getByTestId("button-formula-times"));
    await typeNumber(user, "2");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());

    await user.click(screen.getByTestId(`button-delete-calc-${first}`));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("Dubbel"),
      variant: "destructive",
    }));
    expect(screen.getByTestId(`button-add-calc-${first}`)).toBeInTheDocument();
  });

  it("deletes an unused field and its column", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user);
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    expect(screen.getByTestId("button-remove-column-0")).toBeInTheDocument();
    await user.click(screen.getByTestId(`button-delete-calc-${id}`));
    expect(screen.queryByTestId(`button-add-calc-${id}`)).toBeNull();
    expect(screen.queryByTestId("button-remove-column-0")).toBeNull();
  });

  it("shows a money result cell as € 121,00 under the field's name", async () => {
    const user = userEvent.setup();
    installFetch();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user, "Bedrag");
    installFetch([{ [`calc.${id}`]: "121.00" }]);
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    await user.click(screen.getByTestId("button-run-report"));
    const results = await screen.findByTestId("dialog-report-results");
    expect(within(results).getByText("Incl. btw")).toBeInTheDocument();
    expect(within(results).getByText(/€\s121,00/)).toBeInTheDocument();
  });

  it("offers only Aantal as calculation for a text field", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    const dialog = await screen.findByTestId("dialog-calculated-field");
    await user.type(within(dialog).getByTestId("input-calc-name"), "Klasse");
    await user.click(within(dialog).getByTestId("button-calc-kind-ifThen"));
    await user.click(within(dialog).getByTestId("select-calc-when-field"));
    await user.click(await screen.findByRole("option", { name: "Categorie" }));
    await user.click(within(dialog).getByTestId("select-calc-when-test"));
    await user.click(await screen.findByRole("option", { name: "is leeg" }));
    await user.type(within(dialog).getByTestId("input-calc-then-text"), "Geen");
    await user.type(within(dialog).getByTestId("input-calc-otherwise-text"), "Wel");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());
    await user.click(screen.getAllByTestId(/^button-add-calc-/)[0]);
    await user.click(screen.getByTestId("select-column-aggregation-0"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["Geen", "Aantal"]);
  });

  it("names the calculated field when the server refuses it", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user);
    executeError = { message: "Calculated field invalid", code: "REPORT_CALC_INVALID", error: "CYCLE", id };
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    const call = toast.mock.calls.find((c) => c[0].variant === "destructive")![0];
    expect(call.description).toContain("Incl. btw");
  });
});

describe("fix round 1", () => {
  it("removes one chip by its own button, names the bar and alerts the error", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    await user.click(screen.getByTestId("button-formula-field-expenses.amount"));
    await user.click(screen.getByTestId("button-formula-times"));
    await typeNumber(user, "1,21");
    const bar = screen.getByRole("group", { name: "Formule" });
    await user.click(within(bar).getByRole("button", { name: "Verwijder ×" }));
    expect(bar).toHaveTextContent("Bedrag 1,21");
    expect(screen.getByRole("alert")).toHaveTextContent("Er mist een rekenteken");
  });

  it("shows the number it read next to the input", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    await screen.findByTestId("dialog-calculated-field");
    await user.type(screen.getByTestId("input-formula-number"), "1.210");
    expect(screen.getByTestId("formula-number-parsed")).toHaveTextContent("= 1210");
  });

  it("explains a percent and sends a percent filter as a ratio", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    const dialog = await screen.findByTestId("dialog-calculated-field");
    await user.type(within(dialog).getByTestId("input-calc-name"), "Marge");
    await user.click(within(dialog).getByTestId("button-formula-field-expenses.amount"));
    await user.click(within(dialog).getByTestId("button-formula-divide"));
    await user.click(within(dialog).getByTestId("button-formula-field-expenses.amount"));
    await user.click(within(dialog).getByTestId("select-calc-type"));
    await user.click(await screen.findByRole("option", { name: "Procent" }));
    expect(within(dialog).getByTestId("calc-percent-hint")).toHaveTextContent("Bijvoorbeeld Marge ÷ Omzet geeft 25 %.");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());
    const id = screen.getAllByTestId(/^button-add-calc-/)[0].getAttribute("data-testid")!.replace("button-add-calc-", "");
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    await user.click(screen.getByTestId("button-add-filter"));
    await user.click(screen.getByTestId("select-filter-field"));
    await user.click(await screen.findByRole("option", { name: "Marge" }));
    await user.click(screen.getByTestId("select-filter-operator"));
    await user.click(await screen.findByRole("option", { name: "is groter dan" }));
    await user.type(screen.getByTestId("input-filter-value"), "25");
    await user.click(screen.getByTestId("button-confirm-filter"));
    await user.click(screen.getByTestId("button-run-report"));
    await waitFor(() => expect(executeBody).not.toBeNull());
    expect(executeBody.filters[0]).toMatchObject({ calc: id, operator: "greater_than", value: 0.25 });
  });

  it("refuses to make a number field text while another field calculates with it", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const first = await makeInclVat(user);
    await user.click(screen.getByTestId("button-add-calculated-field"));
    let dialog = await screen.findByTestId("dialog-calculated-field");
    await user.type(within(dialog).getByTestId("input-calc-name"), "Dubbel");
    await user.click(within(dialog).getByTestId(`button-formula-calc-${first}`));
    await user.click(within(dialog).getByTestId("button-formula-times"));
    await typeNumber(user, "2");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    await waitFor(() => expect(screen.queryByTestId("dialog-calculated-field")).toBeNull());

    await user.click(screen.getByTestId(`button-edit-calc-${first}`));
    dialog = await screen.findByTestId("dialog-calculated-field");
    await user.click(within(dialog).getByTestId("button-calc-kind-ifThen"));
    await user.click(within(dialog).getByTestId("select-calc-when-field"));
    await user.click(await screen.findByRole("option", { name: "Bedrag" }));
    await user.click(within(dialog).getByTestId("select-calc-when-test"));
    await user.click(await screen.findByRole("option", { name: "is leeg" }));
    await user.type(within(dialog).getByTestId("input-calc-then-text"), "Geen");
    await user.click(within(dialog).getByTestId("button-save-calculated-field"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("wordt gebruikt in Dubbel"),
      variant: "destructive",
    }));
    expect(screen.getByTestId("dialog-calculated-field")).toBeInTheDocument();
  });

  it("flags a field that points at a field that is gone and does not offer it as a column", async () => {
    installFetch();
    const user = userEvent.setup();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user);
    await user.click(screen.getByTestId("checkbox-datasource-expenses"));
    await user.click(screen.getByTestId("checkbox-datasource-vehicles"));
    expect(screen.getByTestId(`calc-broken-${id}`)).toHaveTextContent("Verwijst naar een veld dat niet meer bestaat.");
    expect(screen.getByTestId(`button-add-calc-${id}`)).toBeDisabled();
    await user.click(screen.getByTestId("select-report-group-by"));
    expect(screen.queryByRole("option", { name: "Incl. btw" })).toBeNull();
  });

  it("prints a calculated column with its name and money value", async () => {
    const user = userEvent.setup();
    installFetch();
    renderBuilder();
    await pickExpenses(user);
    const id = await makeInclVat(user, "Bedrag");
    installFetch([{ [`calc.${id}`]: "121.00" }]);
    await user.click(screen.getByTestId(`button-add-calc-${id}`));
    await user.click(screen.getByTestId("button-run-report"));
    await screen.findByTestId("dialog-report-results");
    await user.click(screen.getByTestId("button-report-print"));
    const html = (await screen.findByTestId("print-preview-frame")).getAttribute("srcdoc") ?? "";
    expect(html).toContain("<th>Incl. btw</th>");
    expect(html).toMatch(/<td>€\s121,00<\/td>/);
  });
});

describe("output of calculated columns", () => {
  const calcs = [
    { id: "a", name: "Incl. btw", kind: "formula" as const, type: "money" as const },
    { id: "p", name: "Marge", kind: "formula" as const, type: "percent" as const },
    { id: "n", name: "Dagen", kind: "formula" as const, type: "number" as const },
    { id: "s", name: "Klasse", kind: "ifThen" as const, type: "text" as const },
  ];
  const col = (calc: string, aggregation?: string) =>
    withCalcInfo([{ calc, table: "", field: "", label: "", ...(aggregation ? { aggregation } : {}) }], calcs)[0];
  const t = i18n.t.bind(i18n) as any;

  it("labels the column with the field's name", () => {
    expect(col("a").label).toBe("Incl. btw");
  });

  it("shows money, percent, number and text", () => {
    expect(displayCell(t, col("a"), "121.00").replace(/\s/g, " ")).toBe("€ 121,00");
    expect(displayCell(t, col("p"), "0.125")).toBe("12,50 %");
    expect(displayCell(t, col("p", "COUNT"), "4")).toBe("4");
    expect(displayCell(t, col("n"), "1234.5")).toBe("1.234,5");
    expect(displayCell(t, col("s"), "Hoog")).toBe("Hoog");
    expect(displayCell(t, col("s", "COUNT"), "3")).toBe("3");
    expect(displayCell(t, col("a"), null)).toBe("-");
  });

  it("writes the CSV with Dutch decimals", () => {
    expect(csvCell(t, col("a"), "121.00")).toBe("121,00");
    expect(csvCell(t, col("s"), "Hoog")).toBe("Hoog");
    expect(csvCell(t, col("s", "COUNT"), "3")).toBe("3");
  });

  it("shows a percent as the ratio × 100, also in the CSV (header with (%)) and the chart", () => {
    expect(calcDisplayNumber("percent", 0.25)).toBe(25);
    expect(calcDisplayNumber("money", 0.25)).toBe(0.25);
    expect(csvCell(t, col("p"), "0.25")).toBe("25,00");
    expect(csvHeader(t, [col("p"), col("a")])).toEqual(["Marge (%)", "Incl. btw"]);
    const chart = builderChartData(t, [{ category: "Olie", "calc.p.AVG": "0.25" }],
      [{ table: "expenses", field: "category", label: "" }, col("p", "AVG") as any],
      [{ table: "expenses", field: "category" }])!;
    expect(chart.points[0][chart.series[0].key]).toBe(25);
  });

  it("reads numbers with a comma decimal", () => {
    expect(parseDutchNumber("1,21")).toBe(1.21);
    expect(parseDutchNumber("1.000,5")).toBe(1000.5);
    expect(parseDutchNumber("100")).toBe(100);
    expect(parseDutchNumber("-3")).toBe(-3);
    expect(parseDutchNumber("abc")).toBeNull();
    expect(parseDutchNumber("")).toBeNull();
  });
});
