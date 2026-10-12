/**
 * The postcode + house number row: fills street and city once both are complete, never blocks the form,
 * never looks anything up for a foreign address, and splits "12A" into number and addition.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AddressLookupQuery, AddressLookupResult } from "@shared/address";
import { AddressLookupRow, type AddressLookupRowValue } from "@/components/ui/address-lookup-row";

const fetcher = vi.fn<(q: AddressLookupQuery) => Promise<AddressLookupResult>>();
const found = vi.fn();

function Harness({ enabled = true, initial }: { enabled?: boolean; initial?: Partial<AddressLookupRowValue> }) {
  const [value, setValue] = useState<AddressLookupRowValue>({ postalCode: "", houseNumber: "", addition: "", ...initial });
  return <AddressLookupRow idPrefix="t" value={value} enabled={enabled} fetcher={fetcher} onFound={found} onChange={(p) => setValue((v) => ({ ...v, ...p }))} />;
}

const type = (id: string, text: string) => userEvent.type(screen.getByTestId(id), text);

describe("address lookup row", () => {
  beforeEach(() => { fetcher.mockReset(); found.mockReset(); });

  it("looks the address up once postcode and number are complete, and reports what it found", async () => {
    fetcher.mockResolvedValue({ found: true, exact: true, street: "Coolsingel", city: "Rotterdam", postalCode: "3011 AD" });
    render(<Harness />);
    await type("t-postcode", "3011ad");
    await type("t-number", "4");
    await waitFor(() => expect(found).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith({ postcode: "3011AD", number: "4", addition: "" });
    expect(found.mock.calls[0][0]).toMatchObject({ street: "Coolsingel", city: "Rotterdam" });
    await waitFor(() => expect(screen.getByTestId("address-lookup-status")).toHaveAttribute("data-status", "found"));
  });

  it("waits for the user to stop typing instead of asking on every key", async () => {
    fetcher.mockResolvedValue({ found: true, exact: true, street: "Coolsingel", city: "Rotterdam", postalCode: "3011 AD" });
    render(<Harness initial={{ postalCode: "3011 AD" }} />);
    await type("t-number", "123");
    await waitFor(() => expect(found).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ number: "123" }));
  });

  it("does nothing for an incomplete postcode or an empty number", async () => {
    render(<Harness />);
    await type("t-postcode", "3011");
    await type("t-number", "4");
    await new Promise((r) => setTimeout(r, 600));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByTestId("address-lookup-status")).toBeNull();
  });

  it("says when the address is unknown, and leaves the fields alone", async () => {
    fetcher.mockResolvedValue({ found: false, exact: false });
    render(<Harness initial={{ postalCode: "3011 AD" }} />);
    await type("t-number", "999");
    expect(await screen.findByText(/vinden dit adres niet/i)).toBeInTheDocument();
    expect(found).not.toHaveBeenCalled();
    expect(screen.getByTestId("t-number")).toHaveValue("999");
  });

  it("says when only the addition is unknown, but still fills street and city", async () => {
    fetcher.mockResolvedValue({ found: true, exact: false, street: "Coolsingel", city: "Rotterdam", postalCode: "3011 AD" });
    render(<Harness initial={{ postalCode: "3011 AD", houseNumber: "4" }} />);
    await type("t-addition", "Z");
    await waitFor(() => expect(found).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("address-lookup-status")).toHaveAttribute("data-status", "partial"));
  });

  it("does not break the form when the lookup service is down", async () => {
    fetcher.mockRejectedValue(new Error("502"));
    render(<Harness initial={{ postalCode: "3011 AD" }} />);
    await type("t-number", "4");
    await waitFor(() => expect(screen.getByTestId("address-lookup-status")).toHaveAttribute("data-status", "unavailable"));
    expect(found).not.toHaveBeenCalled();
    await type("t-addition", "A");
    expect(screen.getByTestId("t-addition")).toHaveValue("A");
  });

  it("does not look up a foreign address", async () => {
    render(<Harness enabled={false} initial={{ postalCode: "3011 AD" }} />);
    await type("t-number", "4");
    await new Promise((r) => setTimeout(r, 600));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("moves the letters of '12A' typed in the number field to the addition", async () => {
    fetcher.mockResolvedValue({ found: false, exact: false });
    render(<Harness initial={{ postalCode: "3011 AD" }} />);
    await type("t-number", "12A");
    expect(screen.getByTestId("t-number")).toHaveValue("12");
    expect(screen.getByTestId("t-addition")).toHaveValue("A");
    await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith({ postcode: "3011AD", number: "12", addition: "A" }));
  });

  it("writes a house letter in capitals", async () => {
    render(<Harness />);
    await type("t-number", "12a");
    expect(screen.getByTestId("t-addition")).toHaveValue("A");
    await type("t-addition", "b");
    expect(screen.getByTestId("t-addition")).toHaveValue("AB");
  });

  it("writes the postcode with a space when the field is left", async () => {
    render(<Harness />);
    await type("t-postcode", "3011ad");
    await userEvent.tab();
    expect(screen.getByTestId("t-postcode")).toHaveValue("3011 AD");
  });
});
