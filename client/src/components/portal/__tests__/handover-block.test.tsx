/**
 * The block at the top of a reservation: pickup before the rental, return during it. Where depends on the reservation
 * (our shop, or a place agreed with the office); the return instructions go with every return.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HandoverBlock } from "@/components/portal/handover-block";

const info = {
  pickupAddress: "Kerkweg 47a, 3214 VC Zuidland", openingHours: "Maandag t/m vrijdag 08:00 - 17:00",
  pickupInstructions: "Neem een geldig rijbewijs mee.", returnInstructions: "Lever de auto schoon en compleet in, anders rekenen wij kosten.",
  deliveryNote: "Brengen en halen kan, vanaf € 125.", privacyUrl: "", phone: "0181 - 45 10 40",
};
const shop = { pickup: { method: "shop", location: null }, return: { method: "shop", location: null } } as const;
const base = { id: 1, status: "picked_up", startDate: "2026-10-01", endDate: "2026-10-20", startTime: null, endTime: null, handover: shop };
const props = { info, canExtend: true, canReturnEarly: true, onExtend: vi.fn(), onReturnEarly: vi.fn() };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-12T12:00:00+02:00")); props.onExtend.mockClear(); props.onReturnEarly.mockClear(); });
afterEach(() => vi.useRealTimers());

describe("return (the car is on the road)", () => {
  it("counts down to the end date, with date and time, and the shop's address and opening hours", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, endTime: "16:30" }} />);
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("Nog 8 dagen");
    expect(screen.getByTestId("handover-when")).toHaveTextContent("20-10-2026 · om 16:30");
    expect(screen.getByTestId("handover-shop")).toHaveTextContent("Kerkweg 47a");
    expect(screen.getByTestId("handover-shop")).toHaveTextContent("08:00 - 17:00");
    expect(screen.getByTestId("handover-block")).toHaveAttribute("data-state", "return");
  });

  it("always gives the return instructions: clean and complete, or it costs", () => {
    render(<HandoverBlock {...props} reservation={base} />);
    expect(screen.getByTestId("handover-return-instructions")).toHaveTextContent(/schoon en compleet/);
    expect(screen.getByTestId("handover-return-instructions")).toHaveTextContent(/kosten/);
  });

  it("says the time is by arrangement when there is none, and 'tomorrow' / 'today'", () => {
    const { rerender } = render(<HandoverBlock {...props} reservation={{ ...base, endDate: "2026-10-13" }} />);
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("Morgen");
    expect(screen.getByTestId("handover-when")).toHaveTextContent("tijdstip in overleg");
    rerender(<HandoverBlock {...props} reservation={{ ...base, endDate: "2026-10-12" }} />);
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("Vandaag");
  });

  it("has no countdown for a rental without an end date, and says so", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, endDate: null }} />);
    expect(screen.queryByTestId("handover-countdown")).toBeNull();
    expect(screen.getByTestId("handover-when")).toHaveTextContent(/geen einddatum/i);
  });

  it("turns red and urgent when the end date has passed, with the extend button as the main action", async () => {
    render(<HandoverBlock {...props} reservation={{ ...base, endDate: "2026-10-09" }} />);
    expect(screen.getByTestId("handover-block")).toHaveAttribute("data-state", "late");
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("3 dagen te laat");
    expect(screen.getByTestId("handover-late")).toHaveTextContent(/verleng de huur of lever de auto in/i);
    await userEvent.click(screen.getByTestId("button-handover-extend"));
    expect(props.onExtend).toHaveBeenCalledTimes(1);
    // Returning early makes no sense when the end date is already behind us.
    expect(screen.queryByTestId("button-handover-early-return")).toBeNull();
  });

  it("says we collect the car at the agreed place, without the shop's opening hours", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, handover: { ...shop, return: { method: "collection", location: "Havenweg 9, Rotterdam" } } }} />);
    expect(screen.getByTestId("handover-away")).toHaveTextContent("Wij halen de auto bij u op:");
    expect(screen.getByTestId("handover-away")).toHaveTextContent("Havenweg 9, Rotterdam");
    expect(screen.queryByTestId("handover-shop")).toBeNull();
    expect(screen.queryByText(/08:00 - 17:00/)).toBeNull();
    // The car still has to come back clean and complete, whoever collects it.
    expect(screen.getByTestId("handover-return-instructions")).toBeInTheDocument();
    expect(screen.queryByTestId("handover-delivery-note")).toBeNull();
  });

  it("says the place will be agreed when the office has not filled it in yet", () => {
    render(<HandoverBlock {...props} reservation={{ ...base, handover: { ...shop, return: { method: "collection", location: null } } }} />);
    expect(screen.getByTestId("handover-away")).toHaveTextContent("een locatie die we met u afspreken");
  });

  it("offers the extend and early-return buttons only to accounts that may use them", async () => {
    const { rerender } = render(<HandoverBlock {...props} reservation={base} />);
    await userEvent.click(screen.getByTestId("button-handover-early-return"));
    expect(props.onReturnEarly).toHaveBeenCalledTimes(1);
    rerender(<HandoverBlock {...props} canExtend={false} canReturnEarly={false} reservation={base} />);
    expect(screen.queryByTestId("button-handover-extend")).toBeNull();
    expect(screen.queryByTestId("button-handover-early-return")).toBeNull();
  });

  it("tells shop customers that bringing and collecting can be arranged, with the price", () => {
    render(<HandoverBlock {...props} reservation={base} />);
    expect(screen.getByTestId("handover-delivery-note")).toHaveTextContent("vanaf € 125");
  });
});

describe("pickup (the rental has not started)", () => {
  const booked = { ...base, status: "booked", startDate: "2026-10-15", startTime: "09:00" };

  it("at the shop: when, the address and opening hours, the pickup instructions, and no buttons", () => {
    render(<HandoverBlock {...props} reservation={booked} />);
    expect(screen.getByTestId("handover-countdown")).toHaveTextContent("Over 3 dagen");
    expect(screen.getByTestId("handover-when")).toHaveTextContent("15-10-2026 · om 09:00");
    expect(screen.getByTestId("handover-shop")).toHaveTextContent("U haalt de auto op bij ons:");
    expect(screen.getByText(/geldig rijbewijs/)).toBeInTheDocument();
    expect(screen.queryByTestId("handover-return-instructions")).toBeNull();
    expect(screen.queryByTestId("button-handover-extend")).toBeNull();
  });

  it("delivered: we bring the car to the agreed place, without the shop's hours", () => {
    render(<HandoverBlock {...props} reservation={{ ...booked, handover: { ...shop, pickup: { method: "delivery", location: "Dorpsstraat 1, 1234 AB Utrecht" } } }} />);
    expect(screen.getByTestId("handover-away")).toHaveTextContent("Wij brengen de auto naar:");
    expect(screen.getByTestId("handover-away")).toHaveTextContent("Dorpsstraat 1, 1234 AB Utrecht");
    expect(screen.queryByTestId("handover-shop")).toBeNull();
  });

  it("shows nothing for a reservation that is finished", () => {
    const { container } = render(<HandoverBlock {...props} reservation={{ ...base, status: "completed" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
