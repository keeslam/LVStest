/**
 * Kees, 2026-10-18: the customer adds a PDF or photo with a description to a reservation. The form
 * checks type and size before sending; the list shows what was uploaded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

const { portalFetch } = vi.hoisted(() => ({ portalFetch: vi.fn(async () => ({ id: 9 })) }));
vi.mock("@/lib/portal-api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-api")>()), portalFetch }));

import { ReservationUploads } from "@/components/portal/reservation-uploads";

const url = "/api/portal/reservations/7/uploads";
function renderWith(uploads: unknown[], canUpload = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["portal", url], uploads);
  return render(<QueryClientProvider client={qc}><ReservationUploads reservationId={7} canUpload={canUpload} /><Toaster /></QueryClientProvider>);
}

describe("documenten uploaden bij een reservering", () => {
  beforeEach(() => portalFetch.mockClear());

  it("sends the file with its description", async () => {
    renderWith([]);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByTestId("button-add-upload"));
    await user.type(screen.getByTestId("input-upload-description"), "Tankbon");
    await user.upload(screen.getByTestId("input-upload-file"), new File(["%PDF-1.4"], "bon.pdf", { type: "application/pdf" }));
    await user.click(screen.getByTestId("button-send-upload"));
    await waitFor(() => expect(portalFetch).toHaveBeenCalledWith("POST", url, expect.any(FormData)));
    const body = (portalFetch.mock.calls[0] as unknown as [string, string, FormData])[2];
    expect(body.get("description")).toBe("Tankbon");
    expect((body.get("file") as File).name).toBe("bon.pdf");
  });

  it("refuses a file over 10 MB before sending", async () => {
    renderWith([]);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByTestId("button-add-upload"));
    await user.type(screen.getByTestId("input-upload-description"), "Groot");
    const big = new File(["x"], "groot.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await user.upload(screen.getByTestId("input-upload-file"), big);
    await user.click(screen.getByTestId("button-send-upload"));
    expect(portalFetch).not.toHaveBeenCalled();
    expect(await screen.findByText("Het bestand is groter dan 10 MB.")).toBeInTheDocument();
  });

  it("lists what was uploaded; a cancelled reservation shows no upload button", () => {
    renderWith([{ id: 3, reservationId: 7, fileName: "schade.jpg", contentType: "image/jpeg", fileSize: 1000, description: "Kras op deur", uploadedAt: "2026-10-18T10:00:00.000Z" }], false);
    expect(screen.getByTestId("upload-3")).toHaveTextContent("Kras op deur");
    expect(screen.getByTestId("upload-3")).toHaveTextContent("schade.jpg");
    expect(screen.queryByTestId("button-add-upload")).not.toBeInTheDocument();
  });
});
