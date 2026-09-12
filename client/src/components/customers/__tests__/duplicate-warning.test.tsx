/**
 * OPT-019 — the warning half: name the existing record, offer to open it, and
 * never stand in the way.
 *
 * Runs in the jsdom project (plan §8.8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DuplicateWarning, duplicateLookupUrl, isWorthChecking,
} from "@/components/customers/duplicate-warning";
import { getQueryFn } from "@/lib/queryClient";

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

let fetchMock: ReturnType<typeof vi.fn>;
let duplicates: unknown[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  duplicates = [{ id: 1302, name: "Jansen BV", matchedOn: ["email"] }];
  fetchMock = vi.fn(async () => json({ duplicates }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OPT-019 — de duplicaatwaarschuwing", () => {
  it("builds the lookup URL from whatever is filled in", () => {
    expect(duplicateLookupUrl("customer", { email: "a@b.nl" })).toBe("/api/customers/duplicates?email=a%40b.nl");
    expect(duplicateLookupUrl("driver", { phone: "0612345678", excludeId: 7 }))
      .toBe("/api/drivers/duplicates?phone=0612345678&excludeId=7");
  });

  it("asks nothing for input too vague to match on", () => {
    expect(isWorthChecking("", "")).toBe(false);
    expect(isWorthChecking("jan", "")).toBe(false);
    expect(isWorthChecking("", "0612")).toBe(false);
    expect(isWorthChecking("jan@bedrijf.nl", "")).toBe(true);
    expect(isWorthChecking("", "06-12345678")).toBe(true);
  });

  it("names the existing customer and what matched, in Dutch", async () => {
    withClient(<DuplicateWarning kind="customer" email="jan@bedrijf.nl" />);
    expect(await screen.findByTestId("duplicate-warning-customer")).toBeInTheDocument();
    expect(screen.getByText("Deze klant bestaat mogelijk al")).toBeInTheDocument();
    expect(screen.getByText(/Jansen BV/)).toHaveTextContent("zelfde e-mailadres");
  });

  it("says out loud that it is not a block", async () => {
    withClient(<DuplicateWarning kind="customer" email="jan@bedrijf.nl" />);
    expect(await screen.findByText("Je kunt gewoon doorgaan; dit is een waarschuwing, geen blokkade."))
      .toBeInTheDocument();
  });

  it("offers to open the existing record", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    withClient(<DuplicateWarning kind="customer" email="jan@bedrijf.nl" onOpen={onOpen} />);
    await user.click(await screen.findByTestId("button-open-duplicate-1302"));
    expect(onOpen).toHaveBeenCalledWith(1302);
  });

  it("renders nothing at all when there is no match", async () => {
    duplicates = [];
    const { container } = withClient(<DuplicateWarning kind="driver" email="niemand@bedrijf.nl" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-testid^='duplicate-warning']")).toBeNull());
  });

  it("does not ask the server anything while the field is still too vague", async () => {
    withClient(<DuplicateWarning kind="customer" email="ja" phone="" />);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports both fields when both matched", async () => {
    duplicates = [{ id: 1302, name: "Jansen BV", matchedOn: ["email", "phone"] }];
    withClient(<DuplicateWarning kind="customer" email="jan@bedrijf.nl" phone="0612345678" />);
    expect(await screen.findByText(/Jansen BV/)).toHaveTextContent("e-mailadres + telefoonnummer");
  });
});
