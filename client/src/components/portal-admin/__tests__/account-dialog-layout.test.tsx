/**
 * Owner walk-through 11-10-2026: the "Portaalaccount" dialog was max-w-lg and scrolled on a
 * desktop screen. It is now wider (sm:max-w-3xl) and the form is two columns from md up (the
 * customer combobox full-width on top; below it e-mail, name, role left and the rights right), still one column on a phone.
 *
 * Runs in the jsdom project (no layout engine: this checks the classes, the real height is
 * measured in the browser).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDialog } from "@/components/portal-admin/account-dialog";
import { getQueryFn } from "@/lib/queryClient";

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, queryFn: getQueryFn({ on401: "throw" }) } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("portaalaccount-venster - indeling", () => {
  it("is wide on desktop and keeps scrolling as a fallback", async () => {
    renderDialog();
    const content = await screen.findByTestId("dialog-portal-account");
    expect(content.className).toContain("sm:max-w-3xl");
    expect(content.className).toContain("max-h-[90vh]");
  });

  it("puts the customer combobox full-width on top and the fields and rights in two columns below it", async () => {
    renderDialog();
    const picker = await screen.findByTestId("select-portal-customer");
    const email = screen.getByTestId("input-account-email");
    const rights = screen.getByTestId("checkbox-permission-canBook");
    const grid = email.closest('[class*="md:grid-cols-2"]') as HTMLElement;
    expect(grid).not.toBeNull();
    // The combobox is not inside the two-column grid: it spans the dialog.
    expect(grid.contains(picker)).toBe(false);
    const columns = Array.from(grid.children);
    expect(columns).toHaveLength(2);
    expect(columns[0].contains(email)).toBe(true);
    expect(columns[1].contains(rights)).toBe(true);
    expect(columns[1].contains(email)).toBe(false);
    // The rights are a compact two-column grid.
    expect(rights.closest(".grid-cols-2")).not.toBeNull();
  });
});
