/**
 * Kees, 2026-10-19: a notification about one fine links to /fines?bekeuring=<id>; the page opens that
 * fine and takes the parameter off the address.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { openFineDialog, navigate, search } = vi.hoisted(() => ({ openFineDialog: vi.fn(), navigate: vi.fn(), search: { value: "" } }));
vi.mock("@/contexts/GlobalDialogContext", () => ({ useGlobalDialog: () => ({ openFineDialog }) }));
vi.mock("wouter", async (importOriginal) => ({ ...(await importOriginal<typeof import("wouter")>()), useSearch: () => search.value, useLocation: () => ["/fines", navigate] }));
vi.mock("@/components/fines/fines-table", () => ({ FinesTable: () => <div data-testid="fines-table" /> }));

import FinesPage from "@/pages/fines/index";

describe("bekeuring openen vanuit een melding", () => {
  beforeEach(() => { openFineDialog.mockClear(); navigate.mockClear(); });

  it("opens the fine named in the address and cleans the address", () => {
    search.value = "bekeuring=42";
    render(<FinesPage />);
    expect(openFineDialog).toHaveBeenCalledWith(42);
    expect(navigate).toHaveBeenCalledWith("/fines", { replace: true });
  });

  it("does nothing without (or with a broken) parameter", () => {
    search.value = "";
    render(<FinesPage />);
    search.value = "bekeuring=abc";
    render(<FinesPage />);
    expect(openFineDialog).not.toHaveBeenCalled();
  });
});
