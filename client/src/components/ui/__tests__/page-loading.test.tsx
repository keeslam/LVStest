/**
 * A-19-4 (audit 2026-10-09): a lazy route shows a centred "Laden…" instead of
 * a blank page while its chunk arrives, and the spinner is gone afterwards.
 */
import { describe, it, expect } from "vitest";
import { Suspense, lazy } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PageLoading } from "@/components/ui/page-loading";

describe("PageLoading", () => {
  it("is a status with the translated label", () => {
    render(<PageLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Laden…");
  });

  it("shows while a lazy page loads and disappears when it has", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const Late = lazy(async () => {
      await gate;
      return { default: () => <p>De pagina</p> };
    });
    render(
      <Suspense fallback={<PageLoading />}>
        <Late />
      </Suspense>,
    );
    expect(screen.getByTestId("page-loading")).toBeInTheDocument();
    expect(screen.queryByText("De pagina")).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("De pagina")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument());
  });
});
