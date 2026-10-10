/**
 * A-19-5: the one toast that fires for a failed GET on any screen used to put
 * the wire text in its description ("500: {"error":"...","details":"..."}").
 * Real queryClient, real Toaster, a stubbed 500.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

function Probe() {
  useQuery({ queryKey: ["/api/probe"] });
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("default query error toast", () => {
  it("shows a Dutch sentence, not the raw JSON of a 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Failed to load", details: "relation x does not exist" }), { status: 500, headers: { "Content-Type": "application/json" } })),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
        <Toaster />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Kon de gegevens niet laden")).toBeInTheDocument();
    expect(screen.getByText(/Er ging iets mis op de server/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/relation x|500:|\{"error"/);
  });
});
