/**
 * A-2-7: the dashboard banner showed the English technical line
 * ("Laatste fout: ...: pg_dump executable not found"). It shows a Dutch
 * sentence chosen by the server's lastErrorCode and never the raw text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: 1, username: "kees", role: "admin", permissions: [] }, isLoading: false }),
}));

import { BackupStalenessBanner } from "@/components/backup/backup-staleness-banner";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function renderBanner(health: object) {
  vi.stubGlobal("fetch", vi.fn(async () => json(health)));
  queryClient.clear();
  return render(
    <QueryClientProvider client={queryClient}>
      <BackupStalenessBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => queryClient.clear());
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backup staleness banner", () => {
  it("explains a missing backup tool in Dutch and hides the technical line", async () => {
    renderBanner({
      lastSuccessAt: "2026-08-23T10:00:00.000Z",
      ageHours: 1200,
      stale: true,
      lastError: "2026-10-09T01:00:00.000Z: pg_dump executable not found",
      lastErrorCode: "TOOL_MISSING",
    });
    expect(await screen.findByTestId("banner-backup-stale")).toBeInTheDocument();
    expect(screen.getByText(/Laatste fout: .*back-upprogramma/)).toBeInTheDocument();
    expect(screen.queryByText(/pg_dump executable not found/)).toBeNull();
  });

  it("falls back to a neutral Dutch sentence for an unknown code", async () => {
    renderBanner({ lastSuccessAt: null, ageHours: null, stale: true, lastError: "raw english", lastErrorCode: "UNKNOWN" });
    expect(await screen.findByTestId("banner-backup-stale")).toBeInTheDocument();
    expect(screen.queryByText(/raw english/)).toBeNull();
    expect(screen.getByText(/Zie het serverlog/)).toBeInTheDocument();
  });
});
