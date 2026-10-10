/**
 * Audit remediation P11 / A-10-9: uploading a document asked for four steps before a file could be
 * chosen (button, vehicle, "Document uploaden" again, type). The form can now be shown directly
 * once the vehicle is known; the dialog-with-a-trigger form stays for every other caller.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineDocumentUpload } from "@/components/documents/inline-document-upload";

function renderUpload(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("InlineDocumentUpload - inline", () => {
  it("shows the file input and the type choice at once, without a button or a second dialog", () => {
    renderUpload(<InlineDocumentUpload vehicleId={5} inline />);
    expect(screen.getByTestId("inline-document-upload")).toBeInTheDocument();
    expect(screen.getByText("Documenttype")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The submit button stays off until there is a file.
    expect(screen.getByRole("button", { name: "Document uploaden" })).toBeDisabled();
  });

  it("hands Cancel to the host dialog instead of closing a dialog of its own", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderUpload(<InlineDocumentUpload vehicleId={5} inline onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Annuleren" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("without `inline` it is still a button that opens a dialog", async () => {
    const user = userEvent.setup();
    renderUpload(<InlineDocumentUpload vehicleId={5} />);
    expect(screen.queryByTestId("inline-document-upload")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Document uploaden" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
