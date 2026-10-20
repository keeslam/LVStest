/**
 * Punt 16 / OPT-009 (Kees, 2026-10-20) — the "Voorstel" block.
 */
import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import userEvent from "@testing-library/user-event";
import "@/i18n";
import { SpareSuggestions } from "@/components/reservations/spare-suggestions";

// The block fetches the full original vehicle when the type is missing; it needs a QueryClient.
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => null } } })}>{ui}</QueryClientProvider>);

const v = (id: number, plate: string, over: Record<string, unknown> = {}) =>
  ({ id, licensePlate: plate, brand: "Ford", model: "Transit", vehicleType: "Van", apkDate: "2030-01-01", ...over });
const original = { brand: "Ford", model: "Transit", vehicleType: "Van" };

describe("SpareSuggestions", () => {
  it("shows the three best cars with the reason and the APK warning", () => {
    render(
      <SpareSuggestions
        original={original}
        candidates={[v(1, "AA111A", { vehicleType: "SUV" }), v(2, "BB222B"), v(3, "CC333C", { apkDate: "2026-10-22" }), v(4, "DD444D", { brand: "Renault" })]}
        endDate="2026-10-25"
        onPick={() => {}}
      />,
    );
    expect(screen.getByTestId("spare-suggestions-2").textContent).toContain("zelfde soort en model");
    expect(screen.getByTestId("spare-suggestions-apk-3").textContent).toContain("22-10-2026");
    expect(screen.getByTestId("spare-suggestions-4").textContent).toContain("zelfde soort");
    expect(screen.queryByTestId("spare-suggestions-1")).toBeNull(); // fourth: other type
  });

  it("picks with one click and never offers a car taken elsewhere", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<SpareSuggestions original={original} candidates={[v(1, "AA"), v(2, "BB")]} endDate={null} takenIds={[1]} onPick={onPick} />);
    expect(screen.queryByTestId("spare-suggestions-1")).toBeNull();
    await user.click(screen.getByTestId("spare-suggestions-pick-2"));
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it("marks the chosen car instead of offering it again", () => {
    render(<SpareSuggestions original={original} candidates={[v(2, "BB")]} endDate={null} selectedId={2} onPick={() => {}} />);
    const button = screen.getByTestId("spare-suggestions-pick-2") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Gekozen");
  });
});
