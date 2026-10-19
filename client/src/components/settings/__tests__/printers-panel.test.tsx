/**
 * Kees, 2026-10-19: Instellingen > Printers (deze pc). Shows whether DYMO Connect answers on this pc
 * (and how to fix it when not), the label makers it knows, the key-label output for this pc, and a
 * test label.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { dymo } = vi.hoisted(() => ({
  dymo: {
    origin: null as string | null,
    printers: [] as Array<{ name: string; modelName: string; isConnected: boolean; autoCut: boolean }>,
    printed: [] as Array<{ printer: string; xml: string }>,
  },
}));
vi.mock("@/lib/dymo-label", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dymo-label")>()),
  findDymoService: vi.fn(async () => dymo.origin),
  listDymoTapePrinters: vi.fn(async () => dymo.printers),
  printDymoLabel: vi.fn(async (_o: string, printer: string, xml: string) => { dymo.printed.push({ printer, xml }); }),
}));

import { PrintersPanel, DYMO_CERTIFICATE_URL } from "@/components/settings/printers-panel";
import { readKeyLabelOutput } from "@/components/barcodes/label-layout-picker";

describe("printers op deze pc", () => {
  beforeEach(() => {
    dymo.origin = null; dymo.printers = []; dymo.printed = [];
    window.localStorage.clear();
  });

  it("without DYMO Connect: says so and offers the certificate page", async () => {
    render(<PrintersPanel />);
    expect(await screen.findByTestId("dymo-help")).toBeInTheDocument();
    expect(screen.getByTestId("dymo-status")).toHaveTextContent("antwoordt niet");
    const link = screen.getByRole("link", { name: /Certificaat van DYMO toestaan/ });
    expect(link).toHaveAttribute("href", DYMO_CERTIFICATE_URL);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("with DYMO Connect: lists the label makers, prints a test label, and keeps the chosen output on this pc", async () => {
    dymo.origin = "https://127.0.0.1:41951";
    dymo.printers = [
      { name: "DYMO LabelManager 420P", modelName: "LabelManager 420P", isConnected: true, autoCut: true },
      { name: "DYMO LabelWriter 450", modelName: "LabelWriter 450", isConnected: false, autoCut: false },
    ];
    render(<PrintersPanel />);
    expect(await screen.findByTestId("dymo-printers")).toHaveTextContent("Verbonden");
    expect(screen.getByTestId("dymo-status")).toHaveTextContent("2 labelmakers");
    expect(screen.getByTestId("button-test-print-DYMO LabelWriter 450")).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-test-print-DYMO LabelManager 420P"));
    await waitFor(() => expect(dymo.printed.map((p) => p.printer)).toEqual(["DYMO LabelManager 420P"]));
    expect(dymo.printed[0].xml).toContain("Testlabel");

    await user.click(screen.getByTestId("select-key-label-output"));
    await user.click(await screen.findByRole("option", { name: /DYMO LabelManager 420P/ }));
    expect(readKeyLabelOutput().output).toBe("printer:DYMO LabelManager 420P");
    expect(await screen.findByText("Gebruikt voor sleutellabels")).toBeInTheDocument();
  });

  it("a label maker chosen before but not on this pc is shown as missing", async () => {
    window.localStorage.setItem("lvs.key-label.tape", JSON.stringify({ output: "printer:Andere pc printer" }));
    dymo.origin = "https://127.0.0.1:41951";
    dymo.printers = [{ name: "DYMO LabelManager 420P", modelName: "LabelManager 420P", isConnected: true, autoCut: true }];
    render(<PrintersPanel />);
    expect(await screen.findByTestId("saved-printer-missing")).toHaveTextContent("Andere pc printer");
  });
});
